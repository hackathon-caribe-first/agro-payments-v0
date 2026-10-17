// /api settlement bodies → domain terms. Amounts arrive in whole pesos and leave in minor units; errors are keyed by the wire field.
import { addFieldError, type FieldErrors, FORM_LEVEL_KEY, ValidationError } from "../../../shared/domain-errors";
import { PROJECT_ASSET_SCALE, pesosToMinor } from "../../projects/application/project";
import type { InvestorPosition } from "../application/settlement";
import type { SettlementRequest } from "../application/settlement.use-cases";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const isHttpsUrl = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

const isPesos = (v: unknown, positive: boolean): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && (positive ? v > 0 : v >= 0) && Number.isSafeInteger(v * 10 ** PROJECT_ASSET_SCALE);

function pesos(errors: FieldErrors, path: string, value: unknown, { optional = false, positive = false } = {}): number {
  if (value === undefined && optional) return 0;
  if (!isPesos(value, positive)) {
    addFieldError(errors, path, positive ? "Ingresa un valor entero en pesos mayor a cero." : "Ingresa un valor entero en pesos, cero o mayor.");
    return 0;
  }
  return pesosToMinor(value, PROJECT_ASSET_SCALE);
}

// Investor positions may still come in the body (capital in COP as it reached custody); omitted (or null), the use case takes
// the project's captured investments (RF-10).
function investors(errors: FieldErrors, value: unknown): InvestorPosition[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0) {
    addFieldError(errors, "investors", "Agrega al menos un inversionista.");
    return [];
  }
  const seen = new Set<string>();
  return value.map((raw, i) => {
    const at = (field: string) => `investors.${i}.${field}`;
    const v = isObject(raw) ? raw : {};
    const id = typeof v.id === "string" ? v.id.trim() : "";
    if (id === "") addFieldError(errors, at("id"), "Ingresa el identificador del inversionista.");
    else if (seen.has(id)) addFieldError(errors, at("id"), "El inversionista está repetido.");
    seen.add(id);
    const capital = pesos(errors, at("capital"), v.capital, { positive: true });
    if (typeof v.currency !== "string" || !/^[A-Z]{3}$/.test(v.currency)) addFieldError(errors, at("currency"), "Ingresa un código de moneda ISO 4217, por ejemplo COP o EUR.");
    if (!isHttpsUrl(v.wallet_address)) addFieldError(errors, at("wallet_address"), "Ingresa la dirección https de la billetera.");
    return { id, capital, currency: String(v.currency), walletAddress: String(v.wallet_address) };
  });
}

export function parseSettlementRequest(body: unknown): SettlementRequest {
  if (!isObject(body)) throw new ValidationError({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] }, "Invalid request shape");
  const errors: FieldErrors = {};
  // Omitted (or null): the use case takes what is still in custody.
  const proceeds = body.proceeds === undefined || body.proceeds === null ? null : pesos(errors, "proceeds", body.proceeds);
  const integratorDebt = pesos(errors, "integrator_debt", body.integrator_debt, { optional: true });
  const wallet = body.integrator_wallet_address;
  if (wallet !== undefined && wallet !== null && !isHttpsUrl(wallet)) addFieldError(errors, "integrator_wallet_address", "Ingresa la dirección https de la billetera del integrador.");
  else if (integratorDebt > 0 && !isHttpsUrl(wallet)) addFieldError(errors, "integrator_wallet_address", "La deuda del integrador necesita su billetera.");
  const producerContribution = pesos(errors, "producer_contribution", body.producer_contribution, { optional: true });
  const days = body.days;
  if (days !== undefined && days !== null && !(typeof days === "number" && Number.isSafeInteger(days) && days >= 0)) addFieldError(errors, "days", "Ingresa los días del ciclo como un entero.");
  const positions = investors(errors, body.investors);
  if (Object.keys(errors).length > 0) throw new ValidationError(errors, "Invalid settlement payload");
  return {
    proceeds,
    integratorDebt,
    integratorWalletAddress: isHttpsUrl(wallet) ? wallet : null,
    producerContribution,
    days: typeof days === "number" ? days : null,
    investors: positions,
  };
}
