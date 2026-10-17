// Domain → /api wire: snake_case, money in whole pesos (the sheet keeps COP minor units), rates and percentages as is.
import { minorToPesos, PROJECT_ASSET_SCALE, PROJECT_CURRENCY } from "../../projects/application/project";
import { PRICE_KIND, type Distribution } from "../application/motor";
import type { Preset } from "../application/presets";
import type { SimulationRun } from "../application/simulation-run";

const pesos = (minor: number) => minorToPesos(minor, PROJECT_ASSET_SCALE);
const pesosOrNull = (minor: number | null) => (minor === null ? null : pesos(minor));
const dist = (d: Distribution) => ({ p10: d.p10, median: d.median, p90: d.p90 });

export function toSimulationResponse(run: SimulationRun) {
  const s = run.sheet;
  return {
    id: run.id,
    project_id: run.projectId,
    preset: run.preset,
    motor_version: run.motorVersion,
    seed: run.seed,
    runs: s.runs,
    crop: s.crop,
    currency: PROJECT_CURRENCY,
    created_by: run.createdBy,
    created_at: run.createdAt.toISOString(),
    admission: {
      passes_filters: s.admission.passesFilters,
      failed_filters: s.admission.failedFilters,
      score: s.admission.score,
      level: s.admission.level,
      milestone_range: s.admission.milestoneRange,
      labor_line: s.admission.laborLine,
    },
    capital: {
      cost: pesos(s.capital.cost),
      producer_contribution: pesos(s.capital.producerContribution),
      milestones_total: pesos(s.capital.milestonesTotal),
      contingency: pesos(s.capital.contingency),
      insurance_premium: pesos(s.capital.insurancePremium),
      fiduciary_fees: pesos(s.capital.fiduciaryFees),
      capital: pesos(s.capital.capital),
      investor_capital: pesos(s.capital.investorCapital),
      integrator_capital: pesos(s.capital.integratorCapital),
    },
    milestones: s.milestones.map((m) => ({
      sequence: m.sequence,
      title: m.title,
      day: m.day,
      share_pct: m.sharePct,
      budget: pesos(m.budget),
      supplies: pesos(m.supplies),
      labor: pesos(m.labor),
      fee: pesos(m.fee),
      contingency: pesos(m.contingency),
    })),
    coverage: { base: s.coverage.base, stress: s.coverage.stress, min_base: s.coverage.minBase, min_stress: s.coverage.minStress, passes: s.coverage.passes },
    breakeven: { yield_kg_per_ha: s.breakeven.yieldKgPerHa, price_per_kg: pesos(s.breakeven.pricePerKg), safety_margin_pct: s.breakeven.safetyMarginPct },
    base_scenario: { proceeds: pesos(s.base.proceeds), investors_total: pesos(s.base.investorsTotal), recovery_pct: s.base.recoveryPct, tir_pct: s.base.tirPct },
    monte_carlo: {
      tir_pct: dist(s.monteCarlo.tirPct),
      recovery_pct: dist(s.monteCarlo.recoveryPct),
      prob_capital_loss_pct: s.monteCarlo.probCapitalLossPct,
      prob_value_preserved_pct: s.monteCarlo.probValuePreservedPct,
    },
    currencies: s.currencies.map((c) => ({
      currency: c.currency,
      entry_rate: c.entryRate,
      equilibrium_rate: c.equilibriumRate,
      exits: c.exits.map((e) => ({ exit_rate: e.exitRate, tir_base_pct: e.tirBasePct, tir_pct: dist(e.tirPct) })),
    })),
    offer: {
      publishable: s.offer.publishable,
      reasons: s.offer.reasons.map((r) => ({ code: r.code, message: r.message })),
      offered_return_pct: s.offer.offeredReturnPct,
      contract_price_per_kg: pesos(s.offer.contractPricePerKg),
      minimum_contract_price_per_kg: pesosOrNull(s.offer.minimumContractPricePerKg),
      median_minimum_contract_price_per_kg: pesosOrNull(s.offer.medianMinimumContractPricePerKg),
    },
  };
}

export function toPresetResponse(p: Preset) {
  const i = p.inputs;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    crop: i.crop,
    hectares: i.hectares,
    days: i.days,
    cost_per_hectare: i.costPerHectare,
    expected_yield_kg_per_ha: i.expectedYieldKgPerHa,
    contract_price_per_kg: i.price.kind === PRICE_KIND.FIXED ? i.price.perKg : null,
    offered_return_pct: i.offeredReturnPct,
    currencies: i.currencies.map((c) => c.currency),
  };
}
