import { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import type { SimulationPreset, SimulationSheet } from "../domain/sheet";
import { presetDtoSchema, simulationDtoSchema } from "./dto";

function parse<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid ${what}: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

export function toSheet(data: unknown): SimulationSheet {
  const d = parse(simulationDtoSchema, data, "simulation");
  return {
    id: d.id,
    projectId: d.project_id,
    preset: d.preset,
    motorVersion: d.motor_version,
    seed: d.seed,
    runs: d.runs,
    crop: d.crop,
    currency: d.currency,
    createdAt: d.created_at,
    level: d.admission.level,
    score: d.admission.score,
    capital: d.capital.capital,
    investorCapital: d.capital.investor_capital,
    insurancePremium: d.capital.insurance_premium,
    milestones: d.milestones.map((m) => ({
      sequence: m.sequence,
      title: m.title,
      day: m.day,
      sharePct: m.share_pct,
      budget: m.budget,
      supplies: m.supplies,
      labor: m.labor,
      fee: m.fee,
      contingency: m.contingency,
    })),
    coverageBase: d.coverage.base,
    coverageStress: d.coverage.stress,
    coverageMinBase: d.coverage.min_base,
    baseRecoveryPct: d.base_scenario.recovery_pct,
    tirPct: d.monte_carlo.tir_pct,
    probCapitalLossPct: d.monte_carlo.prob_capital_loss_pct,
    probValuePreservedPct: d.monte_carlo.prob_value_preserved_pct,
    currencies: d.currencies.map((c) => ({
      currency: c.currency,
      entryRate: c.entry_rate,
      equilibriumRate: c.equilibrium_rate,
      exits: c.exits.map((e) => ({ exitRate: e.exit_rate, tirBasePct: e.tir_base_pct, tirPct: e.tir_pct })),
    })),
    offer: {
      publishable: d.offer.publishable,
      reasons: d.offer.reasons,
      offeredReturnPct: d.offer.offered_return_pct,
      contractPricePerKg: d.offer.contract_price_per_kg,
      minimumContractPricePerKg: d.offer.minimum_contract_price_per_kg,
    },
  };
}

export const toPresets = (data: unknown): SimulationPreset[] =>
  parse(z.array(presetDtoSchema), data, "presets").map((p) => ({ id: p.id, name: p.name, description: p.description, contractPricePerKg: p.contract_price_per_kg }));
