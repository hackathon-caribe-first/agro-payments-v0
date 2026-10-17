// /api simulation bodies → a preset plus overrides. Errors are keyed by the wire field.
import { addFieldError, type FieldErrors, FORM_LEVEL_KEY, ValidationError } from "../../../shared/domain-errors";
import { MAX_RUNS } from "../application/motor";
import { isPresetId } from "../application/presets";
import type { SimulationOverrides, SimulationRequest } from "../application/simulation.use-cases";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const POSITIVE: Record<string, keyof SimulationOverrides> = {
  contract_price_per_kg: "contractPricePerKg",
  hectares: "hectares",
  cost_per_hectare: "costPerHectare",
  expected_yield_kg_per_ha: "expectedYieldKgPerHa",
};

export function parseSimulationRequest(body: unknown): SimulationRequest {
  if (!isObject(body)) throw new ValidationError({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] }, "Invalid request shape");
  const errors: FieldErrors = {};
  const overrides: SimulationOverrides = {};
  if (!isPresetId(body.preset)) addFieldError(errors, "preset", "Elige un proyecto de referencia: P1 o P2.");

  for (const [wire, field] of Object.entries(POSITIVE)) {
    const v = body[wire];
    if (v === undefined) continue;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) overrides[field] = v;
    else addFieldError(errors, wire, "Ingresa un número mayor a cero.");
  }
  const offered = body.offered_return_pct;
  if (offered !== undefined) {
    if (typeof offered === "number" && Number.isFinite(offered) && offered >= 0 && offered <= 100) overrides.offeredReturnPct = offered;
    else addFieldError(errors, "offered_return_pct", "Ingresa un porcentaje entre 0 y 100.");
  }
  const runs = body.runs;
  if (runs !== undefined) {
    if (typeof runs === "number" && Number.isInteger(runs) && runs >= 1 && runs <= MAX_RUNS) overrides.runs = runs;
    else addFieldError(errors, "runs", `Ingresa un número entero de escenarios entre 1 y ${MAX_RUNS}.`);
  }
  const seed = body.seed;
  if (seed !== undefined) {
    if (typeof seed === "number" && Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff) overrides.seed = seed;
    else addFieldError(errors, "seed", "Ingresa una semilla entera entre 0 y 4294967295.");
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors, "Invalid simulation payload");
  return { preset: body.preset as SimulationRequest["preset"], overrides };
}
