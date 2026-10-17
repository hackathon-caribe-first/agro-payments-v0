// PRD v3 «Motor de simulación» and Anexo A (A1, A2, A4–A12, A15) as one pure, deterministic function: no Nest, no I/O,
// no Math.random. Ported from the equations (simulador.py is not in the repo); the symbol in each comment is the Anexo's.
//
// Units. Inputs: money in whole pesos, yields in kg/ha, prices in pesos/kg, rates in percent. Outputs: every money figure
// in COP minor units (assetScale 2) as a safe integer. Floats are used INSIDE the statistical model only (it is a model,
// not a ledger); they become integers at the boundary with these rules:
//   - cost, contributions, premium, milestone parts: round half up to the minor unit;
//   - milestone budgets: largest remainder on δ_j, so Σ P_j equals the rounded total exactly;
//   - K (a minimum capital): rounded UP, so the custody balance never goes negative;
//   - minimum contract price: the least WHOLE peso per kg that passes, i.e. rounded up to 100 minor units.
// Percentages, multiples and exchange rates in the sheet are display figures rounded to 2 decimals (coverage 3).
//
// Modelling decisions where the Anexo leaves room (all documented in the report and in the presets):
//   - κ is a contingency RESERVE inside each P_j (D-05). It is part of K and of each grant cap, but it is only spent in a
//     scenario where a catastrophe hits; otherwise it stays in custody (B_d) and goes back through the cascade
//     («lo no ejecutado sigue en custodia y vuelve a los inversionistas»).
//   - Insurance (A6, traditional): the guaranteed value per ha is Y_gat·(1 − λ)·P_g with Y_gat = trigger·E[Y]; the premium
//     is a percentage of it; the deductible a percentage of it. The parametric variant is not modelled.
//   - Stress coverage (A11): yield × 0,8 always; price × 0,85 only without a fixed price (a fixed contract carries no
//     price risk, the same reason A12 draws a lognormal price only without one).
//   - Contracts are in COP (e_g = 1). A USD contract (RF-32) is «Siguiente».
//   - The ficha's per-currency TIR and TRM* use the base-scenario multiple (the PRD table matches TRM_0·expected), and
//     the per-currency Monte Carlo percentiles use the simulated multiples.

import { DomainError } from "../../../shared/domain-errors";
import { PROJECT_ASSET_SCALE } from "../../projects/application/project";
import { SURPLUS_SPLIT_PCT } from "../../settlement/application/liquidation";
import { createRandom } from "./prng";

/** Bumped whenever an equation, a default or a rounding rule changes; stored with every run (RNF-11). */
export const MOTOR_VERSION = "surco-motor@1.0.0";
/** A12: 20.000 runs. */
export const DEFAULT_RUNS = 20_000;
export const MAX_RUNS = 100_000;
/** Fixed seed of the demo (the PRD's date). */
export const DEFAULT_SEED = 20_261_017;

/** A11: coverage ≥ 1,3 in the base scenario and ≥ 1,0 with yield × 0,8 (and price × 0,85 without a fixed price). */
export const COVERAGE_MIN = { base: 1.3, stress: 1.0 } as const;
const STRESS = { yield: 0.8, price: 0.85 } as const;

const MINOR = 10 ** PROJECT_ASSET_SCALE;

export const LEVEL = { A: "A", B: "B", C: "C", FIRST_CYCLE: "primer_ciclo" } as const;
export type Level = (typeof LEVEL)[keyof typeof LEVEL];

/** A15 weights: comercial, capacidad de pago, técnico, historial, tenencia, clima, asociatividad. */
const ADMISSION_WEIGHTS = [20, 20, 20, 15, 10, 10, 5] as const;
/** RF-02, in the PRD's order (Fase 0, paso 2). */
export const ELIMINATION_FILTERS = [
  "Listas restrictivas",
  "Mora mayor de 60 días o con el FAG",
  "Lote en páramo o área protegida",
  "Deforestación posterior a 2020",
  "Sin derecho documentado al predio",
  "Aptitud UPRA nula",
  "Sin agua",
  "Cultivo ilícito o trabajo infantil",
  "Sin forma de reportar avances",
] as const;

export interface MilestoneRange {
  min: number;
  max: number;
}
/** «Niveles de admisión»: A 2–3 hitos, B and C 3–4; first cycle is paid in kind (no range enforced). */
const LEVEL_MILESTONES: Record<Level, MilestoneRange | null> = { A: { min: 2, max: 3 }, B: { min: 3, max: 4 }, C: { min: 3, max: 4 }, primer_ciclo: null };
/** A1: the labor line exists only in levels A and B. */
const LABOR_LEVELS: readonly Level[] = [LEVEL.A, LEVEL.B];

export const PRICE_KIND = { FIXED: "fixed", FORMULA: "formula" } as const;

export interface MilestonePlan {
  title: string;
  /** t_j, days from the start of the cycle. */
  day: number;
  /** δ_j in percent; Σ = 100. */
  sharePct: number;
  /** pct_mo,j in percent of P_j (A and B only). */
  laborPct: number;
}

export interface FixedPrice {
  kind: typeof PRICE_KIND.FIXED;
  perKg: number;
}

/** A5 formula P_g = max(floor, min(ceiling, (1 − d_off)·P_spot)) with a lognormal spot (A12). */
export interface FormulaPrice {
  kind: typeof PRICE_KIND.FORMULA;
  spotPerKg: number;
  floorPerKg: number;
  ceilingPerKg: number;
  discountPct: number;
  /** μ, annual. */
  driftPct: number;
  /** σ_P, annual. */
  volatilityPct: number;
  /** ρ between yield and price shocks, in [−1, 1]. */
  correlation: number;
}

export type ContractPrice = FixedPrice | FormulaPrice;

export interface InsuranceTerms {
  /** P_seg as a percentage of the guaranteed value. */
  premiumPct: number;
  /** σ_ISA. */
  subsidyPct: number;
  /** Y_gat as a percentage of the expected yield. */
  triggerPct: number;
  /** Ded as a percentage of the guaranteed value. */
  deductiblePct: number;
}

export interface InvestorCurrency {
  currency: string;
  /** TRM_0: pesos per unit of the currency at entry. */
  entryRate: number;
  /** TRM_d scenarios (the ficha shows three). */
  exitRates: number[];
}

export interface AdmissionInput {
  /** B_k: true = passes. Nine, in ELIMINATION_FILTERS order. */
  filters: boolean[];
  /** X_m ∈ [0, 100], seven, in ADMISSION_WEIGHTS order. */
  blocks: number[];
}

export interface SimulationInputs {
  crop: string;
  /** H */
  hectares: number;
  /** d */
  days: number;
  /** C_ha, pesos. */
  costPerHectare: number;
  /** V_prod as a percentage of C. */
  producerContributionPct: number;
  /** X_3 exists only if the producer's contribution was cash. */
  producerContributionInCash: boolean;
  /** κ */
  contingencyPct: number;
  /** f_h */
  platformFeePct: number;
  milestones: MilestonePlan[];
  /** E[Y], kg/ha. */
  expectedYieldKgPerHa: number;
  /** λ */
  shrinkagePct: number;
  /** s */
  offContractPct: number;
  price: ContractPrice;
  insurance: InsuranceTerms;
  /** τ_par, τ_ret (0 in demo mode, D-15). */
  parafiscalPct: number;
  withholdingPct: number;
  /** C_log, pesos per tonne (0 in demo mode). */
  logisticsPerTonne: number;
  /** r_f (0 in demo mode). */
  fiduciaryYieldPct: number;
  /** G_mes, pesos, paid every 30 days (0 in demo mode). */
  fiduciaryMonthlyFee: number;
  /** ω, r_FIN and ICR (pesos): Finagro, 0 without an integrator. */
  integratorSharePct: number;
  integratorRatePct: number;
  icr: number;
  /** h */
  preferredRatePct: number;
  /** r_ofrecido */
  offeredReturnPct: number;
  /** π */
  inflationPct: number;
  /** p_cat and D_cat ~ U[min, max]. */
  catastropheProbabilityPct: number;
  catastropheMinPct: number;
  catastropheMaxPct: number;
  /** σ_Y */
  yieldNoisePct: number;
  currencies: InvestorCurrency[];
  admission: AdmissionInput;
  runs: number;
  seed: number;
}

export interface AdmissionResult {
  passesFilters: boolean;
  failedFilters: string[];
  score: number;
  level: Level;
  milestoneRange: MilestoneRange | null;
  laborLine: boolean;
}

export interface MilestoneBudget {
  sequence: number;
  title: string;
  day: number;
  sharePct: number;
  /** P_j: the grant cap. */
  budget: number;
  supplies: number;
  labor: number;
  fee: number;
  /** κ reserve inside P_j. */
  contingency: number;
}

export interface Budgets {
  /** C */
  cost: number;
  /** V_prod */
  producerContribution: number;
  /** (C − V_prod)(1 + κ) = Σ P_j */
  total: number;
  milestones: MilestoneBudget[];
}

export interface CapitalSummary {
  cost: number;
  producerContribution: number;
  milestonesTotal: number;
  contingency: number;
  insurancePremium: number;
  fiduciaryFees: number;
  /** K */
  capital: number;
  /** K_INV = (1 − ω)K */
  investorCapital: number;
  /** ωK */
  integratorCapital: number;
}

export interface CoverageResult {
  base: number;
  stress: number;
  minBase: number;
  minStress: number;
  passes: boolean;
}

export interface Breakeven {
  yieldKgPerHa: number;
  /** minor units per kg */
  pricePerKg: number;
  safetyMarginPct: number;
}

export interface BaseScenario {
  /** L, minor units. */
  proceeds: number;
  /** X_INV, minor units. */
  investorsTotal: number;
  /** X_INV / K_INV in percent. */
  recoveryPct: number;
  tirPct: number;
}

export interface Distribution {
  p10: number;
  median: number;
  p90: number;
}

export interface MonteCarloSummary {
  tirPct: Distribution;
  recoveryPct: Distribution;
  /** Pr(X_INV < K_INV) */
  probCapitalLossPct: number;
  /** A10: Pr(X_INV ≥ K_INV(1 + π)^(d/365)) */
  probValuePreservedPct: number;
}

export interface ExitScenario {
  exitRate: number;
  tirBasePct: number;
  tirPct: Distribution;
}

export interface CurrencySheet {
  currency: string;
  entryRate: number;
  /** TRM* = TRM_0 · X_INV / K_INV (base scenario). */
  equilibriumRate: number;
  exits: ExitScenario[];
}

export const OFFER_REASON = {
  ADMISSION_FILTERS: "admission_filters",
  MILESTONE_COUNT: "milestone_count",
  MEDIAN_BELOW_OFFER: "median_below_offer",
  COVERAGE_BASE: "coverage_base",
  COVERAGE_STRESS: "coverage_stress",
} as const;
export type OfferReasonCode = (typeof OFFER_REASON)[keyof typeof OFFER_REASON];

export interface OfferReason {
  code: OfferReasonCode;
  message: string;
}

export interface OfferVerdict {
  publishable: boolean;
  reasons: OfferReason[];
  offeredReturnPct: number;
  /** The contract price simulated, minor units per kg. */
  contractPricePerKg: number;
  /** Least whole-peso price per kg that passes the median AND the coverage rules; null without a fixed price. */
  minimumContractPricePerKg: number | null;
  /** A12 as written: least price whose median TIR_COP reaches r_ofrecido. */
  medianMinimumContractPricePerKg: number | null;
}

export interface SimulationSheet {
  motorVersion: string;
  seed: number;
  runs: number;
  crop: string;
  admission: AdmissionResult;
  capital: CapitalSummary;
  milestones: MilestoneBudget[];
  coverage: CoverageResult;
  breakeven: Breakeven;
  base: BaseScenario;
  monteCarlo: MonteCarloSummary;
  currencies: CurrencySheet[];
  offer: OfferVerdict;
}

// ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const frac = (pct: number) => pct / 100;
const toMinor = (pesos: number) => Math.round(pesos * MINOR);
const roundTo = (x: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(x * f) / f + 0; // + 0 turns −0 into 0
};
const pct2 = (fraction: number) => roundTo(fraction * 100, 2);
const comma = (x: number, decimals: number) => x.toFixed(decimals).replace(".", ",");

/** Largest remainder split of an integer total by percentage weights; ties go to the earlier weight. */
function splitByShares(total: number, sharesPct: number[]): number[] {
  const exact = sharesPct.map((s) => (total * s) / 100);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((a, b) => (b.rest === a.rest ? a.i - b.i : b.rest - a.rest));
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

/** Linear-interpolated quantile (numpy's default) of an ascending array. */
function quantile(sorted: Float64Array, q: number): number {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** The deterministic contract price (formula: clamp of the discounted spot drifted to harvest). */
function basePrice(inputs: SimulationInputs): number {
  const p = inputs.price;
  if (p.kind === PRICE_KIND.FIXED) return p.perKg;
  const spot = p.spotPerKg * Math.exp(frac(p.driftPct) * (inputs.days / 365));
  return Math.max(p.floorPerKg, Math.min(p.ceilingPerKg, (1 - frac(p.discountPct)) * spot));
}

/** Valor garantizado per hectare: Y_gat·(1 − λ)·P_g. */
const guaranteedValuePerHa = (inputs: SimulationInputs) =>
  frac(inputs.insurance.triggerPct) * inputs.expectedYieldKgPerHa * (1 - frac(inputs.shrinkagePct)) * basePrice(inputs);

// ── equations ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A15: S = (∏ B_k)·Σ w_m X_m → level. */
export function admission(input: AdmissionInput): AdmissionResult {
  if (input.filters.length !== ELIMINATION_FILTERS.length) throw new DomainError(`Admission needs ${ELIMINATION_FILTERS.length} filters`);
  if (input.blocks.length !== ADMISSION_WEIGHTS.length || !input.blocks.every((x) => Number.isFinite(x) && x >= 0 && x <= 100)) {
    throw new DomainError(`Admission needs ${ADMISSION_WEIGHTS.length} block scores between 0 and 100`);
  }
  const failedFilters = ELIMINATION_FILTERS.filter((_, i) => !input.filters[i]);
  const raw = input.blocks.reduce((s, x, i) => s + ADMISSION_WEIGHTS[i] * x, 0) / 100;
  const score = failedFilters.length > 0 ? 0 : roundTo(raw, 2);
  const level = score >= 75 ? LEVEL.A : score >= 60 ? LEVEL.B : score >= 50 ? LEVEL.C : LEVEL.FIRST_CYCLE;
  return { passesFilters: failedFilters.length === 0, failedFilters, score, level, milestoneRange: LEVEL_MILESTONES[level], laborLine: LABOR_LEVELS.includes(level) };
}

/** A1: C = H·C_ha; P_j = δ_j(C − V_prod)(1 + κ) = P_ins + P_mo + f_h·P_j (+ the κ reserve). */
export function budgets(inputs: SimulationInputs, level: Level): Budgets {
  const cost = toMinor(inputs.hectares * inputs.costPerHectare);
  const producerContribution = toMinor(inputs.hectares * inputs.costPerHectare * frac(inputs.producerContributionPct));
  const kappa = frac(inputs.contingencyPct);
  const total = Math.round((cost - producerContribution) * (1 + kappa));
  const labor = LABOR_LEVELS.includes(level);
  const shares = splitByShares(
    total,
    inputs.milestones.map((m) => m.sharePct),
  );
  const milestones = inputs.milestones.map((m, i): MilestoneBudget => {
    const budget = shares[i];
    const fee = Math.round(budget * frac(inputs.platformFeePct));
    const contingency = budget - Math.round(budget / (1 + kappa));
    const laborAmount = labor ? Math.round(budget * frac(m.laborPct)) : 0;
    const supplies = budget - fee - contingency - laborAmount;
    if (supplies < 0) throw new DomainError(`Milestone ${i + 1}: labor, fee and contingency exceed its budget`);
    return { sequence: i + 1, title: m.title, day: m.day, sharePct: m.sharePct, budget, supplies, labor: laborAmount, fee, contingency };
  });
  return { cost, producerContribution, total, milestones };
}

/** A2: H·P_seg(1 − σ_ISA), P_seg a percentage of the guaranteed value. */
export const insurancePremium = (inputs: SimulationInputs) =>
  toMinor(inputs.hectares * guaranteedValuePerHa(inputs) * frac(inputs.insurance.premiumPct) * (1 - frac(inputs.insurance.subsidyPct)));

const dailyRate = (annualPct: number) => (1 + frac(annualPct)) ** (1 / 365) - 1;
const feeDays = (days: number) => Array.from({ length: Math.floor(days / 30) }, (_, n) => 30 * (n + 1));

/**
 * A2: K* = min{K : B_t ≥ 0 ∀t} with B_0 = K − premium, B_t = B_{t−1}(1 + i_f) − D_t − G_t. Every outflow is non-negative,
 * so B_t ≥ 0 ∀t ⟺ K ≥ Σ_t (D_t + G_t)·(1 + i_f)^(−t) + premium: the present value of everything custody pays, rounded up.
 * ponytail: each milestone's labor and fee are discounted from t_j, not t_j + Δ_j (Δ_j is not in the inputs); with r_f > 0
 * that overstates K by a few days of yield on ~18 % of each budget. Exact in demo mode (r_f = 0).
 */
export function minimumCapital(inputs: SimulationInputs, b: Budgets): number {
  const i = dailyRate(inputs.fiduciaryYieldPct);
  const pv = (amount: number, day: number) => amount / (1 + i) ** day;
  const disbursements = b.milestones.reduce((s, m) => s + pv(m.budget, m.day), 0);
  const fees = feeDays(inputs.days).reduce((s, t) => s + pv(toMinor(inputs.fiduciaryMonthlyFee), t), 0);
  return Math.ceil(insurancePremium(inputs) + disbursements + fees - 1e-6);
}

/** A9 */
export const tirFromMultiple = (multiple: number, days: number) => (multiple <= 0 ? -1 : multiple ** (365 / days) - 1);
export const currencyTir = (multiple: number, entryRate: number, exitRate: number, days: number) => tirFromMultiple((multiple * entryRate) / exitRate, days);
export const equilibriumRate = (multiple: number, entryRate: number) => entryRate * multiple;

export interface CascadeTerms {
  investorCapital: number;
  debt: number;
  preferredRatePct: number;
  days: number;
  producerContribution: number;
}

/**
 * A8 in pesos as floats, for one Monte Carlo run: X_INV = X_1 + X_2 + β_inv·E. The same order, claims and split as the
 * settlement's computeLiquidation (spec'd against it to the peso); that one stays the integer source of truth for payouts.
 */
export function investorsTotal(proceeds: number, t: CascadeTerms): number {
  let left = Math.max(0, proceeds);
  const take = (claim: number) => {
    const paid = Math.min(left, claim);
    left -= paid;
    return paid;
  };
  take(t.debt);
  const capital = take(t.investorCapital);
  const preferred = take(t.investorCapital * ((1 + frac(t.preferredRatePct)) ** (t.days / 365) - 1));
  take(t.producerContribution);
  return capital + preferred + left * frac(SURPLUS_SPLIT_PCT.investors);
}

/** A11: Cob = L / (K_INV + K_INV[(1 + h)^(d/365) − 1] + X_D). */
export const coverage = (proceeds: number, investorCapital: number, preferredRatePct: number, days: number, debt: number) =>
  proceeds / (investorCapital * (1 + frac(preferredRatePct)) ** (days / 365) + debt);

/** A11: Y_be = C / (H·P(1 − λ)), P_be = C / (H·Y(1 − λ)), MS_Y = (E[Y] − Y_be) / E[Y]. */
export function breakeven(inputs: SimulationInputs): Breakeven {
  const cost = inputs.hectares * inputs.costPerHectare;
  const kept = 1 - frac(inputs.shrinkagePct);
  const yieldBe = cost / (inputs.hectares * basePrice(inputs) * kept);
  return {
    yieldKgPerHa: roundTo(yieldBe, 1),
    pricePerKg: toMinor(cost / (inputs.hectares * inputs.expectedYieldKgPerHa * kept)),
    safetyMarginPct: pct2((inputs.expectedYieldKgPerHa - yieldBe) / inputs.expectedYieldKgPerHa),
  };
}

// ── Monte Carlo ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** One run's shocks, drawn once and reused for every price tried (common random numbers keep the search monotone). */
interface Draws {
  damage: Float64Array;
  yieldShock: Float64Array;
  priceShock: Float64Array;
}

/** Four uniforms per run, always in the same order, whatever branch the run takes: u_cat, u_D, then a Box–Muller pair. */
function draw(inputs: SimulationInputs): Draws {
  const random = createRandom(inputs.seed);
  const n = inputs.runs;
  const d: Draws = { damage: new Float64Array(n), yieldShock: new Float64Array(n), priceShock: new Float64Array(n) };
  const rho = inputs.price.kind === PRICE_KIND.FORMULA ? inputs.price.correlation : 0;
  const span = frac(inputs.catastropheMaxPct) - frac(inputs.catastropheMinPct);
  for (let r = 0; r < n; r++) {
    const hit = random.uniform() < frac(inputs.catastropheProbabilityPct);
    const u = random.uniform();
    const [zy, z2] = random.normalPair();
    d.damage[r] = hit ? frac(inputs.catastropheMinPct) + span * u : 0;
    d.yieldShock[r] = zy;
    d.priceShock[r] = rho * zy + Math.sqrt(1 - rho * rho) * z2;
  }
  return d;
}

interface Model {
  k: number;
  kInv: number;
  integrator: number;
  premium: number;
  terms: CascadeTerms;
  /** L for a yield (kg/ha), a price (pesos/kg) and whether the κ reserve was spent; pesos. */
  proceeds(yieldKgPerHa: number, price: number, reserveSpent: boolean): number;
}

/** A2, A5–A7: K, K_INV and the cash at liquidation L = I(1 − τ) + Ind + B_d + ICR − C_log. */
function model(inputs: SimulationInputs, b: Budgets): Model {
  const k = minimumCapital(inputs, b);
  const integrator = Math.round(k * frac(inputs.integratorSharePct));
  const kInv = k - integrator;
  const premium = insurancePremium(inputs);
  const t = inputs.days / 365;
  const debt = (integrator / MINOR) * (1 + frac(inputs.integratorRatePct)) ** t;
  const growth = (day: number) => (1 + dailyRate(inputs.fiduciaryYieldPct)) ** (inputs.days - day);
  const fee = toMinor(inputs.fiduciaryMonthlyFee);
  // What is left in custody at d when everything is spent (the rounding slack of K, plus yield), and the κ reserve's value.
  const spentFv =
    premium * growth(0) + b.milestones.reduce((s, m) => s + m.budget * growth(m.day), 0) + feeDays(inputs.days).reduce((s, day) => s + fee * growth(day), 0);
  const leftover = (k * growth(0) - spentFv) / MINOR;
  const reserve = b.milestones.reduce((s, m) => s + m.contingency * growth(m.day), 0) / MINOR;

  const kept = 1 - frac(inputs.shrinkagePct);
  const sold = 1 - frac(inputs.offContractPct);
  const insuredPrice = basePrice(inputs);
  const trigger = frac(inputs.insurance.triggerPct) * inputs.expectedYieldKgPerHa;
  const deductible = frac(inputs.insurance.deductiblePct) * guaranteedValuePerHa(inputs);
  const taxes = frac(inputs.parafiscalPct) + frac(inputs.withholdingPct);
  const proceeds = (y: number, price: number, reserveSpent: boolean) => {
    const q = inputs.hectares * y * kept * sold;
    const indemnity = inputs.hectares * Math.max(0, (trigger - y) * kept * insuredPrice - deductible);
    const custody = leftover + (reserveSpent ? 0 : reserve);
    return q * price * (1 - taxes) + indemnity + custody + inputs.icr - (inputs.logisticsPerTonne * q) / 1000;
  };
  return {
    k,
    kInv,
    integrator,
    premium,
    terms: {
      investorCapital: kInv / MINOR,
      debt,
      preferredRatePct: inputs.preferredRatePct,
      days: inputs.days,
      producerContribution: inputs.producerContributionInCash ? b.producerContribution / MINOR : 0,
    },
    proceeds,
  };
}

interface Evaluation {
  model: Model;
  baseProceeds: number;
  baseMultiple: number;
  coverageBase: number;
  coverageStress: number;
  /** Ascending X_INV / K_INV of every run. */
  multiples: Float64Array;
}

/** A12: Y = E[Y](1 − D_cat)(1 + σ_Y Z_Y); ln P_d = ln P_0 + (μ − σ²/2)T + σ√T Z_P; one cascade per run. */
function evaluate(inputs: SimulationInputs, b: Budgets, d: Draws): Evaluation {
  const m = model(inputs, b);
  const multipleOf = (proceeds: number) => investorsTotal(proceeds, m.terms) / m.terms.investorCapital;
  const price0 = basePrice(inputs);
  const baseProceeds = m.proceeds(inputs.expectedYieldKgPerHa, price0, false);
  const stressPrice = inputs.price.kind === PRICE_KIND.FIXED ? price0 : price0 * STRESS.price;
  const stressProceeds = m.proceeds(inputs.expectedYieldKgPerHa * STRESS.yield, stressPrice, false);
  const cov = (proceeds: number) => coverage(proceeds, m.terms.investorCapital, inputs.preferredRatePct, inputs.days, m.terms.debt);

  const t = inputs.days / 365;
  const p = inputs.price;
  const priceOf =
    p.kind === PRICE_KIND.FIXED
      ? () => p.perKg
      : (z: number) => {
          const sigma = frac(p.volatilityPct);
          const spot = p.spotPerKg * Math.exp((frac(p.driftPct) - (sigma * sigma) / 2) * t + sigma * Math.sqrt(t) * z);
          return Math.max(p.floorPerKg, Math.min(p.ceilingPerKg, (1 - frac(p.discountPct)) * spot));
        };
  const sigmaY = frac(inputs.yieldNoisePct);
  const multiples = new Float64Array(inputs.runs);
  for (let r = 0; r < inputs.runs; r++) {
    const y = Math.max(0, inputs.expectedYieldKgPerHa * (1 - d.damage[r]) * (1 + sigmaY * d.yieldShock[r]));
    multiples[r] = multipleOf(m.proceeds(y, priceOf(d.priceShock[r]), d.damage[r] > 0));
  }
  multiples.sort();
  return { model: m, baseProceeds, baseMultiple: multipleOf(baseProceeds), coverageBase: cov(baseProceeds), coverageStress: cov(stressProceeds), multiples };
}

const medianTir = (e: Evaluation, days: number) => tirFromMultiple(quantile(e.multiples, 0.5), days);
const passesMedian = (e: Evaluation, inputs: SimulationInputs) => medianTir(e, inputs.days) >= frac(inputs.offeredReturnPct);
const passesCoverage = (e: Evaluation) => e.coverageBase >= COVERAGE_MIN.base && e.coverageStress >= COVERAGE_MIN.stress;

/**
 * A12: P_min = min{P : rule(P)}, over whole pesos per kg, by doubling then bisection on the same draws. The bracket keeps
 * «lo fails, hi passes», so the answer passes and one peso less does not. Null without a fixed price or past 1.024× the
 * contract price (nothing reasonable passes).
 */
function minimumPrice(inputs: SimulationInputs, b: Budgets, d: Draws, rule: (e: Evaluation, i: SimulationInputs) => boolean): number | null {
  if (inputs.price.kind !== PRICE_KIND.FIXED) return null;
  const fixed = inputs.price;
  const passes = (perKg: number) => {
    const at = { ...inputs, price: { ...fixed, perKg } };
    return rule(evaluate(at, b, d), at);
  };
  let lo = 0;
  let hi = Math.max(1, Math.ceil(fixed.perKg));
  while (!passes(hi)) {
    lo = hi;
    hi *= 2;
    if (hi > fixed.perKg * 1024) return null;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (passes(mid)) hi = mid;
    else lo = mid;
  }
  return hi * MINOR;
}

function validate(inputs: SimulationInputs) {
  const positive = (x: number) => Number.isFinite(x) && x > 0;
  const pct = (x: number) => Number.isFinite(x) && x >= 0 && x <= 100;
  if (!positive(inputs.hectares) || !positive(inputs.costPerHectare) || !positive(inputs.expectedYieldKgPerHa)) throw new DomainError("Hectares, cost and yield must be positive");
  if (!Number.isInteger(inputs.days) || inputs.days <= 0) throw new DomainError("Days must be a positive integer");
  if (!Number.isInteger(inputs.runs) || inputs.runs < 1 || inputs.runs > MAX_RUNS) throw new DomainError(`Runs must be an integer between 1 and ${MAX_RUNS}`);
  if (inputs.milestones.length === 0) throw new DomainError("At least one milestone");
  const shares = inputs.milestones.reduce((s, m) => s + m.sharePct, 0);
  if (Math.abs(shares - 100) > 1e-9) throw new DomainError("Milestone shares must sum to 100");
  if (!inputs.milestones.every((m) => Number.isInteger(m.day) && m.day >= 0 && m.day <= inputs.days && pct(m.sharePct) && pct(m.laborPct))) {
    throw new DomainError("Milestone days must be within the cycle and percentages between 0 and 100");
  }
  const rates = [
    inputs.producerContributionPct,
    inputs.contingencyPct,
    inputs.platformFeePct,
    inputs.shrinkagePct,
    inputs.offContractPct,
    inputs.parafiscalPct,
    inputs.withholdingPct,
    inputs.integratorSharePct,
    inputs.catastropheProbabilityPct,
    inputs.catastropheMinPct,
    inputs.catastropheMaxPct,
    inputs.yieldNoisePct,
    ...Object.values(inputs.insurance),
  ];
  if (!rates.every(pct) || inputs.catastropheMinPct > inputs.catastropheMaxPct) throw new DomainError("Percentages must be between 0 and 100");
  const free = [inputs.fiduciaryYieldPct, inputs.integratorRatePct, inputs.preferredRatePct, inputs.offeredReturnPct, inputs.inflationPct];
  if (!free.every((x) => Number.isFinite(x) && x > -100)) throw new DomainError("Rates must be finite and above −100 %");
  if (![inputs.logisticsPerTonne, inputs.fiduciaryMonthlyFee, inputs.icr].every((x) => Number.isFinite(x) && x >= 0)) throw new DomainError("Amounts must be non-negative");
  if (inputs.price.kind === PRICE_KIND.FIXED ? !positive(inputs.price.perKg) : !positive(inputs.price.spotPerKg) || Math.abs(inputs.price.correlation) > 1) {
    throw new DomainError("The contract price must be positive");
  }
  if (!inputs.currencies.every((c) => positive(c.entryRate) && c.exitRates.length > 0 && c.exitRates.every(positive))) throw new DomainError("Exchange rates must be positive");
  if (!Number.isInteger(inputs.seed) || inputs.seed < 0 || inputs.seed > 0xffff_ffff) throw new DomainError("The seed must be an unsigned 32-bit integer");
}

const distribution = (sorted: Float64Array, f: (multiple: number) => number): Distribution => ({
  p10: pct2(f(quantile(sorted, 0.1))),
  median: pct2(f(quantile(sorted, 0.5))),
  p90: pct2(f(quantile(sorted, 0.9))),
});

/** RF-06 + RF-07 + RF-30: the ficha, with the offer rule's verdict. Same inputs and seed → identical output (RNF-11). */
export function simulate(inputs: SimulationInputs): SimulationSheet {
  validate(inputs);
  const adm = admission(inputs.admission);
  const b = budgets(inputs, adm.level);
  const d = draw(inputs);
  const e = evaluate(inputs, b, d);
  const { model: m, multiples } = e;
  const days = inputs.days;

  const reasons: OfferReason[] = [];
  if (!adm.passesFilters) reasons.push({ code: OFFER_REASON.ADMISSION_FILTERS, message: `No pasa los filtros eliminatorios: ${adm.failedFilters.join(", ")}.` });
  const range = adm.milestoneRange;
  if (range && (b.milestones.length < range.min || b.milestones.length > range.max)) {
    reasons.push({ code: OFFER_REASON.MILESTONE_COUNT, message: `El nivel ${adm.level} pide entre ${range.min} y ${range.max} hitos; el proyecto tiene ${b.milestones.length}.` });
  }
  const median = medianTir(e, days);
  if (!passesMedian(e, inputs)) {
    reasons.push({
      code: OFFER_REASON.MEDIAN_BELOW_OFFER,
      message: `La mediana simulada de la TIR en pesos (${comma(median * 100, 1)} %) no alcanza el retorno a ofrecer (${comma(inputs.offeredReturnPct, 1)} %).`,
    });
  }
  if (e.coverageBase < COVERAGE_MIN.base) {
    reasons.push({ code: OFFER_REASON.COVERAGE_BASE, message: `La cobertura del escenario base (${comma(e.coverageBase, 2)}) no llega a ${comma(COVERAGE_MIN.base, 1)}.` });
  }
  if (e.coverageStress < COVERAGE_MIN.stress) {
    reasons.push({ code: OFFER_REASON.COVERAGE_STRESS, message: `Con rendimiento y precio estresados la cobertura (${comma(e.coverageStress, 2)}) no llega a ${comma(COVERAGE_MIN.stress, 1)}.` });
  }


  const contingency = b.milestones.reduce((s, x) => s + x.contingency, 0);
  return {
    motorVersion: MOTOR_VERSION,
    seed: inputs.seed,
    runs: inputs.runs,
    crop: inputs.crop,
    admission: adm,
    capital: {
      cost: b.cost,
      producerContribution: b.producerContribution,
      milestonesTotal: b.total,
      contingency,
      insurancePremium: m.premium,
      fiduciaryFees: feeDays(days).length * toMinor(inputs.fiduciaryMonthlyFee),
      capital: m.k,
      investorCapital: m.kInv,
      integratorCapital: m.integrator,
    },
    milestones: b.milestones,
    coverage: {
      base: roundTo(e.coverageBase, 3),
      stress: roundTo(e.coverageStress, 3),
      minBase: COVERAGE_MIN.base,
      minStress: COVERAGE_MIN.stress,
      passes: passesCoverage(e),
    },
    breakeven: breakeven(inputs),
    base: {
      proceeds: toMinor(e.baseProceeds),
      investorsTotal: toMinor(investorsTotal(e.baseProceeds, m.terms)),
      recoveryPct: pct2(e.baseMultiple),
      tirPct: pct2(tirFromMultiple(e.baseMultiple, days)),
    },
    monteCarlo: {
      tirPct: distribution(multiples, (x) => tirFromMultiple(x, days)),
      recoveryPct: distribution(multiples, (x) => x),
      probCapitalLossPct: pct2(multiples.filter((x) => x < 1).length / multiples.length),
      probValuePreservedPct: pct2(multiples.filter((x) => x >= (1 + frac(inputs.inflationPct)) ** (days / 365)).length / multiples.length),
    },
    currencies: inputs.currencies.map((c) => ({
      currency: c.currency,
      entryRate: c.entryRate,
      equilibriumRate: roundTo(equilibriumRate(e.baseMultiple, c.entryRate), 2),
      exits: c.exitRates.map((exitRate) => ({
        exitRate,
        tirBasePct: pct2(currencyTir(e.baseMultiple, c.entryRate, exitRate, days)),
        tirPct: distribution(multiples, (x) => currencyTir(x, c.entryRate, exitRate, days)),
      })),
    })),
    offer: {
      publishable: reasons.length === 0,
      reasons,
      offeredReturnPct: inputs.offeredReturnPct,
      contractPricePerKg: toMinor(basePrice(inputs)),
      minimumContractPricePerKg: minimumPrice(inputs, b, d, (x, i) => passesMedian(x, i) && passesCoverage(x)),
      medianMinimumContractPricePerKg: minimumPrice(inputs, b, d, passesMedian),
    },
  };
}
