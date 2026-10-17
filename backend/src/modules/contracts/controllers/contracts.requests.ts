// /api contracts and insurance bodies → use case inputs. Money arrives in whole pesos (prices may carry cents) and leaves in minor
// units; errors are keyed by the wire field. Bodies stay unknown so the global ValidationPipe passes them through.
import { addFieldError, type FieldErrors, FORM_LEVEL_KEY, ValidationError } from "../../../shared/domain-errors";
import { PROJECT_ASSET_SCALE } from "../../projects/application/project";
import type { ClaimInput, PolicyInput, PurchaseContractInput } from "../application/contracts.use-cases";
import { CLAIM_TRIGGER, type ClaimTrigger, ISA_DEFAULTS } from "../application/insurance";
import { CONTRACT_CURRENCIES, CONTRACT_UNITS, type ContractCurrency, type ContractUnit, PRICE_TYPE, type PurchasePrice } from "../application/purchase-contract";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const SCALE = 10 ** PROJECT_ASSET_SCALE;
const WALLET = "Ingresa una dirección de wallet https.";

function object(body: unknown): Json {
  if (!isObject(body)) throw new ValidationError({ [FORM_LEVEL_KEY]: ["El cuerpo debe ser un objeto JSON."] });
  return body;
}

const isHttpsUrl = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

function text(errors: FieldErrors, path: string, value: unknown, message: string, max = 200): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0) addFieldError(errors, path, message);
  else if (trimmed.length > max) addFieldError(errors, path, `Máximo ${max} caracteres.`);
  return trimmed;
}

function wallet(errors: FieldErrors, path: string, value: unknown): string {
  if (!isHttpsUrl(value)) {
    addFieldError(errors, path, WALLET);
    return "";
  }
  return value;
}

/** A positive amount with at most two decimals → minor units. */
function price(errors: FieldErrors, path: string, value: unknown): number {
  const minor = typeof value === "number" && Number.isFinite(value) ? Math.round(value * SCALE) : Number.NaN;
  if (!(minor > 0) || Math.abs(minor - (value as number) * SCALE) > 1e-6 || !Number.isSafeInteger(minor)) {
    addFieldError(errors, path, "Ingresa un precio mayor a cero, con máximo dos decimales.");
    return 0;
  }
  return minor;
}

function oneOf<T extends string>(errors: FieldErrors, path: string, value: unknown, allowed: readonly T[], message: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    addFieldError(errors, path, message);
    return allowed[0];
  }
  return value as T;
}

function optionalNumber(errors: FieldErrors, path: string, value: unknown, message: string, valid: (n: number) => boolean): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || !valid(value)) {
    addFieldError(errors, path, message);
    return null;
  }
  return value;
}

function done<T>(errors: FieldErrors, value: T): T {
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return value;
}

export function parsePurchaseContract(body: unknown): PurchaseContractInput {
  const b = object(body);
  const errors: FieldErrors = {};
  const type = oneOf(errors, "price_type", b.price_type, [PRICE_TYPE.FIXED, PRICE_TYPE.FORMULA], "Elige precio fijo o por fórmula.");
  let parsedPrice: PurchasePrice;
  if (type === PRICE_TYPE.FIXED) {
    parsedPrice = { type, pricePerUnit: price(errors, "price_per_unit", b.price_per_unit) };
  } else {
    const floorPerUnit = price(errors, "floor_per_unit", b.floor_per_unit);
    const ceilingPerUnit = price(errors, "ceiling_per_unit", b.ceiling_per_unit);
    if (floorPerUnit > 0 && ceilingPerUnit > 0 && ceilingPerUnit < floorPerUnit) addFieldError(errors, "ceiling_per_unit", "El techo debe ser mayor o igual al piso.");
    const reference = text(errors, "price_reference", b.price_reference, "Indica la referencia de la fórmula (por ejemplo, el precio spot).");
    parsedPrice = { type, floorPerUnit, ceilingPerUnit, reference };
  }
  const quantity = b.quantity;
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0) addFieldError(errors, "quantity", "Ingresa una cantidad entera mayor a cero.");
  const unit: ContractUnit = oneOf(errors, "unit", b.unit, CONTRACT_UNITS, "Elige kg o t.");
  const currency: ContractCurrency = oneOf(errors, "currency", b.currency, CONTRACT_CURRENCIES, "Elige COP o USD.");
  const email = typeof b.buyer_email === "string" ? b.buyer_email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) addFieldError(errors, "buyer_email", "Ingresa el correo del comprador.");
  const buyerWalletAddress = wallet(errors, "buyer_wallet_address", b.buyer_wallet_address);
  return done(errors, { price: parsedPrice, quantity: quantity as number, unit, currency, buyerEmail: email, buyerWalletAddress });
}

const PCT = "Ingresa un porcentaje entre 0 y 100.";
const inPct = (n: number) => n >= 0 && n <= 100;

export function parsePolicy(body: unknown): PolicyInput {
  const b = object(body);
  const errors: FieldErrors = {};
  const insurerName = text(errors, "insurer_name", b.insurer_name, "Ingresa el nombre de la aseguradora.");
  const insurerWalletAddress = wallet(errors, "insurer_wallet_address", b.insurer_wallet_address);
  const premium = optionalNumber(errors, "premium", b.premium, "Ingresa la prima en pesos enteros, mayor a cero.", (n) => Number.isSafeInteger(n * SCALE) && Number.isInteger(n) && n > 0);
  const subsidyPct = optionalNumber(errors, "subsidy_pct", b.subsidy_pct, PCT, inPct) ?? ISA_DEFAULTS.subsidyPct;
  const thresholdPct = optionalNumber(errors, "threshold_pct", b.threshold_pct, PCT, (n) => n > 0 && n <= 100) ?? ISA_DEFAULTS.thresholdPct;
  const deductiblePct = optionalNumber(errors, "deductible_pct", b.deductible_pct, PCT, inPct) ?? ISA_DEFAULTS.deductiblePct;
  const positive = (path: string, message: string) => optionalNumber(errors, path, b[path], message, (n) => n > 0);
  const hectares = positive("hectares", "Ingresa las hectáreas, mayor a cero.");
  const expectedYieldKgPerHa = positive("expected_yield_kg_per_ha", "Ingresa el rendimiento esperado en kg/ha, mayor a cero.");
  const insuredPricePerKg = b.insured_price_per_kg === undefined || b.insured_price_per_kg === null ? null : price(errors, "insured_price_per_kg", b.insured_price_per_kg);
  const indexTrigger = optionalNumber(errors, "index_trigger", b.index_trigger, "Ingresa el disparo del índice.", () => true);
  const indexExit = optionalNumber(errors, "index_exit", b.index_exit, "Ingresa la salida del índice.", () => true);
  if ((indexTrigger === null) !== (indexExit === null)) addFieldError(errors, "index_exit", "Ingresa el disparo y la salida del índice, o ninguno.");
  else if (indexTrigger !== null && indexExit !== null && indexExit >= indexTrigger) addFieldError(errors, "index_exit", "La salida del índice debe ser menor que el disparo.");
  return done(errors, {
    insurerName,
    insurerWalletAddress,
    grossPremium: premium === null ? null : premium * SCALE,
    subsidyPct,
    thresholdPct,
    deductiblePct,
    hectares,
    expectedYieldKgPerHa,
    insuredPricePerKg,
    indexTrigger,
    indexExit,
  });
}

export function parseClaim(body: unknown): ClaimInput {
  const b = object(body);
  const errors: FieldErrors = {};
  const trigger: ClaimTrigger = oneOf(errors, "trigger", b.trigger, [CLAIM_TRIGGER.YIELD, CLAIM_TRIGGER.INDEX], "Elige rendimiento o índice.");
  const observed = b.observed_value;
  if (typeof observed !== "number" || !Number.isFinite(observed) || observed < 0) addFieldError(errors, "observed_value", "Ingresa el valor observado, cero o mayor.");
  const evidence = text(errors, "evidence", b.evidence, "Describe la evidencia de la pérdida.", 2000);
  return done(errors, { trigger, observedValue: observed as number, evidence });
}
