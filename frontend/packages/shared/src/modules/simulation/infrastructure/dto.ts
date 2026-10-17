import { z } from "zod";

// Transport shape of GET/POST /projects/:id/simulation (snake_case, whole pesos). Only the fields the app reads are
// required; the server sends more (breakeven, base scenario, admission details) and zod strips them.
const distributionDto = z.object({ p10: z.number(), median: z.number(), p90: z.number() });

export const simulationDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  preset: z.string().nullable(),
  motor_version: z.string(),
  seed: z.number().int(),
  runs: z.number().int().positive(),
  crop: z.string(),
  currency: z.string(),
  created_at: z.string(),
  admission: z.object({ level: z.string(), score: z.number() }),
  capital: z.object({ capital: z.number(), investor_capital: z.number(), insurance_premium: z.number() }),
  milestones: z.array(
    z.object({
      sequence: z.number().int(),
      title: z.string(),
      day: z.number().int(),
      share_pct: z.number(),
      budget: z.number(),
      supplies: z.number(),
      labor: z.number(),
      fee: z.number(),
      contingency: z.number(),
    }),
  ),
  coverage: z.object({ base: z.number(), stress: z.number(), min_base: z.number() }),
  base_scenario: z.object({ recovery_pct: z.number() }),
  monte_carlo: z.object({ tir_pct: distributionDto, prob_capital_loss_pct: z.number(), prob_value_preserved_pct: z.number() }),
  currencies: z.array(
    z.object({
      currency: z.string(),
      entry_rate: z.number(),
      equilibrium_rate: z.number(),
      exits: z.array(z.object({ exit_rate: z.number(), tir_base_pct: z.number(), tir_pct: distributionDto })),
    }),
  ),
  offer: z.object({
    publishable: z.boolean(),
    reasons: z.array(z.object({ code: z.string(), message: z.string() })),
    offered_return_pct: z.number(),
    contract_price_per_kg: z.number(),
    minimum_contract_price_per_kg: z.number().nullable(),
  }),
});
export type SimulationDto = z.infer<typeof simulationDtoSchema>;

export const presetDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  contract_price_per_kg: z.number().nullable(),
});
export type PresetDto = z.infer<typeof presetDtoSchema>;
