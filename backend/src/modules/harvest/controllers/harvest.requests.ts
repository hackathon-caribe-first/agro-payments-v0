// /api harvest bodies → use case inputs. Quantities are whole kg and prices whole pesos per kg (A5); errors are keyed by the wire field.
import { addFieldError, type FieldErrors, FORM_LEVEL_KEY, ValidationError } from "../../../shared/domain-errors";
import type { CertifyRequest, DeclareRequest } from "../application/harvest.use-cases";
import type { PriceTerms } from "../domain/harvest";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function object(body: unknown): Json {
  if (!isObject(body)) throw new ValidationError({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] }, "Invalid request shape");
  return body;
}

function whole(errors: FieldErrors, path: string, value: unknown, min: number, message: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    addFieldError(errors, path, message);
    return 0;
  }
  return value;
}

function text(errors: FieldErrors, path: string, value: unknown, min: number, max: number, message: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length < min || trimmed.length > max) addFieldError(errors, path, message);
  return trimmed;
}

const kg = (errors: FieldErrors, path: string, value: unknown) => whole(errors, path, value, 1, "Ingresa la cantidad en kilos como un entero mayor a cero.");
const grade = (errors: FieldErrors, value: unknown) => text(errors, "quality_grade", value, 1, 60, "Ingresa la calidad (máximo 60 caracteres).");

function done<T>(errors: FieldErrors, value: T): T {
  if (Object.keys(errors).length > 0) throw new ValidationError(errors, "Invalid harvest payload");
  return value;
}

export function parseDeclareRequest(body: unknown): DeclareRequest {
  const b = object(body);
  const errors: FieldErrors = {};
  const quantityKg = kg(errors, "quantity_kg", b.quantity_kg);
  const qualityGrade = grade(errors, b.quality_grade);
  const evidence = text(errors, "evidence", b.evidence, 3, 1000, "Describe la evidencia de la cosecha (entre 3 y 1000 caracteres).");
  return done(errors, { quantityKg, qualityGrade, evidence });
}

function price(errors: FieldErrors, value: unknown): PriceTerms | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) {
    addFieldError(errors, "price", "Ingresa el precio por kilo o la fórmula del contrato.");
    return null;
  }
  const pesos = (key: string, min = 0) => whole(errors, `price.${key}`, value[key], min, "Ingresa un valor entero en pesos por kilo.");
  if ("price_per_kg" in value) return { kind: "fixed", pricePerKg: pesos("price_per_kg", 1) };
  const spotPerKg = pesos("spot_price_per_kg", 1);
  const floorPerKg = pesos("floor_price_per_kg");
  const ceilingPerKg = pesos("ceiling_price_per_kg", 1);
  if (floorPerKg > ceilingPerKg) addFieldError(errors, "price.ceiling_price_per_kg", "El techo debe ser igual o mayor al piso.");
  const pct = value.discount_pct;
  const bps = typeof pct === "number" ? Math.round(pct * 100) : Number.NaN;
  if (!(typeof pct === "number" && pct >= 0 && pct <= 100 && Math.abs(pct * 100 - bps) < 1e-9)) {
    addFieldError(errors, "price.discount_pct", "Ingresa el descuento como un porcentaje entre 0 y 100, con máximo dos decimales.");
  }
  return { kind: "formula", spotPerKg, floorPerKg, ceilingPerKg, discountBps: Number.isNaN(bps) ? 0 : bps };
}

export function parseCertifyRequest(body: unknown): CertifyRequest {
  const b = object(body);
  const errors: FieldErrors = {};
  const quantityKg = kg(errors, "certified_quantity_kg", b.certified_quantity_kg);
  const qualityGrade = grade(errors, b.quality_grade);
  const notes = b.notes === undefined || b.notes === null ? "" : text(errors, "notes", b.notes, 0, 1000, "Máximo 1000 caracteres.");
  return done(errors, { quantityKg, qualityGrade, notes: notes === "" ? null : notes, price: price(errors, b.price) });
}
