// /api investment body → domain terms. The amount arrives in whole pesos and leaves in minor units; errors are keyed by the wire field.
import { addFieldError, type FieldErrors, FORM_LEVEL_KEY, ValidationError } from "../../../shared/domain-errors";
import { PROJECT_ASSET_SCALE, pesosToMinor } from "../../projects/application/project";
import type { InvestOrder } from "../application/investments.use-cases";

const isHttpsUrl = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

const isPesos = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0 && Number.isSafeInteger(v * 10 ** PROJECT_ASSET_SCALE);

/** { amount: whole COP pesos the custody receives, wallet_address: the investor's own https wallet address }. */
export function parseInvestRequest(body: unknown): InvestOrder {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] }, "Invalid request shape");
  }
  const { amount, wallet_address: wallet } = body as Record<string, unknown>;
  const errors: FieldErrors = {};
  if (!isPesos(amount)) addFieldError(errors, "amount", "Ingresa un valor entero en pesos mayor a cero.");
  if (!isHttpsUrl(wallet)) addFieldError(errors, "wallet_address", "Ingresa la dirección https de tu billetera.");
  if (Object.keys(errors).length > 0) throw new ValidationError(errors, "Invalid investment payload");
  return { amount: pesosToMinor(amount as number, PROJECT_ASSET_SCALE), walletAddress: wallet as string };
}
