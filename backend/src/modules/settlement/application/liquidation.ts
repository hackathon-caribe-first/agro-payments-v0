// PRD v3 "Cascada de liquidación" and Anexo A8 as a pure function: no Nest, no I/O, integer minor units in and out,
// BigInt for every product and percentage (never floats).
//
//   X_D = min(L, debt)                                  integrator debt (ωK + I_deuda), first in line
//   X_1 = min(L − X_D, K_INV)                           investor capital, pro rata to each k_i
//   X_2 = min(L − X_D − X_1, K_INV·[(1 + h)^(d/365) − 1])  preferred return, h = 12 % E.A.
//   X_3 = min(L − X_D − X_1 − X_2, V_prod)              producer's own cash contribution
//   E   = L − X_D − X_1 − X_2 − X_3                     surplus: 50 % investors, 30 % producer, 20 % platform (D-06)
//
// Rounding (PRD: "porcentajes y redondeo en unidades mínimas", no rule beyond that):
// - the preferred claim is floor(K_INV·(1 + h)^(d/365)) − K_INV, computed exactly as an integer root;
// - the investor and platform surplus shares are floored and the producer takes what is left of E;
// - inside an investor tier, shares are floor(T·k_i/K_INV) and the leftover units go one each to the largest
//   remainders, ties to the earlier investor (largest remainder / Hamilton). Each tier is split on its own.
// L is distributed in full: Σ allocations == L, always.

import { DomainError } from "../../../shared/domain-errors";

export const TIER = {
  INTEGRATOR_DEBT: "integrator_debt",
  INVESTOR_CAPITAL: "investor_capital",
  PREFERRED_RETURN: "preferred_return",
  PRODUCER_CONTRIBUTION: "producer_contribution",
  SURPLUS: "surplus",
} as const;
export type TierKind = (typeof TIER)[keyof typeof TIER];

export const BENEFICIARY_KIND = { INTEGRATOR: "integrator", INVESTOR: "investor", PRODUCER: "producer", PLATFORM: "platform" } as const;
export type BeneficiaryKind = (typeof BENEFICIARY_KIND)[keyof typeof BENEFICIARY_KIND];

/** h = 12 % E.A. (PRD v3 Anexo A, símbolo h). */
export const PREFERRED_RATE_BPS = 1200;

export interface SurplusSplitPct {
  investors: number;
  producer: number;
  platform: number;
}
/** β_inv, β_prod, θ = 50 / 30 / 20 % (Anexo A; D-06: the platform's 20 % of the surplus). */
export const SURPLUS_SPLIT_PCT: SurplusSplitPct = { investors: 50, producer: 30, platform: 20 };

export interface InvestorStake {
  id: string;
  /** k_i: the investor's contribution in COP minor units, as it reached custody. */
  capital: number;
}

export interface LiquidationInput {
  /** L: what is in custody to distribute (harvest, indemnity, unspent milestone money), minor units. */
  proceeds: number;
  /** ωK + I_deuda; 0 without an integrator. */
  integratorDebt: number;
  investors: InvestorStake[];
  /** V_prod, only if it was contributed in cash. */
  producerContribution: number;
  /** d: days of the cycle. */
  days: number;
  preferredRateBps?: number;
  surplusSplitPct?: SurplusSplitPct;
}

/** Investors are keyed by their id; the other parties by their kind. */
export interface Beneficiary {
  kind: BeneficiaryKind;
  id: string;
}

export interface Allocation {
  beneficiary: Beneficiary;
  amount: number;
}

export interface Tier {
  tier: TierKind;
  /** What the tier is owed; null for the surplus, which has no claim. */
  claim: number | null;
  paid: number;
  allocations: Allocation[];
}

export interface LiquidationPlan {
  tiers: Tier[];
  /** One entry per party in order of first appearance; the integrator only when it has a claim. */
  totals: Allocation[];
  /** X_INV = X_1 + X_2 + β_inv·E. */
  investorsTotal: number;
  /** Claims left unpaid: what the investors (and producer) lose when L does not reach. */
  shortfall: number;
}

const INTEGRATOR: Beneficiary = { kind: BENEFICIARY_KIND.INTEGRATOR, id: BENEFICIARY_KIND.INTEGRATOR };
const PRODUCER: Beneficiary = { kind: BENEFICIARY_KIND.PRODUCER, id: BENEFICIARY_KIND.PRODUCER };
const PLATFORM: Beneficiary = { kind: BENEFICIARY_KIND.PLATFORM, id: BENEFICIARY_KIND.PLATFORM };

const isAmount = (n: number) => Number.isSafeInteger(n) && n >= 0;
const min = (a: bigint, b: bigint) => (a < b ? a : b);

/**
 * floor(principal·(1 + bps/10⁴)^(days/365)): the largest y with y³⁶⁵·10⁴ᵈ ≤ principal³⁶⁵·(10⁴ + bps)ᵈ, found by binary search.
 * Exact for any safe-integer principal; the numbers get large (thousands of digits) but BigInt handles them in milliseconds.
 */
export function compoundedFloor(principal: number, rateBps: number, days: number): number {
  if (!isAmount(principal) || !isAmount(rateBps) || !isAmount(days)) throw new DomainError("Compounding needs non-negative safe integers");
  const p = BigInt(principal);
  if (p === 0n || days === 0) return principal;
  const year = 365n;
  const d = BigInt(days);
  const target = p ** year * (10_000n + BigInt(rateBps)) ** d;
  const scale = 10_000n ** d;
  const fits = (y: bigint) => y ** year * scale <= target;
  // Upper bound: growth over whole years is at least growth over d/365 years.
  const years = (d + year - 1n) / year;
  let lo = p;
  let hi = (p * (10_000n + BigInt(rateBps)) ** years) / 10_000n ** years + 1n;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if (fits(mid)) lo = mid;
    else hi = mid - 1n;
  }
  return Number(lo);
}

/** Largest-remainder split of total by weights; ties go to the earlier weight. */
function proRata(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, w) => a + w, 0n);
  const shares = weights.map((w) => (total * w) / sum);
  let left = total - shares.reduce((a, s) => a + s, 0n);
  const byRemainder = weights
    .map((w, i) => ({ i, remainder: (total * w) % sum }))
    .sort((a, b) => (a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1));
  for (const { i } of byRemainder) {
    if (left === 0n) break;
    shares[i] += 1n;
    left -= 1n;
  }
  return shares;
}

function validate(input: LiquidationInput, split: SurplusSplitPct, rateBps: number) {
  if (!isAmount(input.proceeds)) throw new DomainError("Proceeds must be a non-negative safe integer in minor units");
  if (!isAmount(input.integratorDebt)) throw new DomainError("Integrator debt must be a non-negative safe integer in minor units");
  if (!isAmount(input.producerContribution)) throw new DomainError("Producer contribution must be a non-negative safe integer in minor units");
  if (!isAmount(input.days)) throw new DomainError("Days must be a non-negative integer");
  if (!isAmount(rateBps)) throw new DomainError("The preferred rate must be a non-negative integer in basis points");
  if (input.investors.length === 0) throw new DomainError("A liquidation needs at least one investor");
  if (!input.investors.every((i) => Number.isSafeInteger(i.capital) && i.capital > 0)) throw new DomainError("Investor capital must be a positive safe integer");
  if (new Set(input.investors.map((i) => i.id)).size !== input.investors.length) throw new DomainError("Investor ids must be unique");
  if (!Number.isSafeInteger(input.investors.reduce((s, i) => s + i.capital, 0))) throw new DomainError("Total investor capital is too large");
  const parts = [split.investors, split.producer, split.platform];
  if (!parts.every(isAmount) || parts.reduce((a, b) => a + b, 0) !== 100) throw new DomainError("The surplus split must be whole percentages summing to 100");
}

export function computeLiquidation(input: LiquidationInput): LiquidationPlan {
  const split = input.surplusSplitPct ?? SURPLUS_SPLIT_PCT;
  const rateBps = input.preferredRateBps ?? PREFERRED_RATE_BPS;
  validate(input, split, rateBps);

  const investors = input.investors.map((i) => ({ beneficiary: { kind: BENEFICIARY_KIND.INVESTOR, id: i.id }, weight: BigInt(i.capital) }));
  const capital = investors.reduce((s, i) => s + i.weight, 0n);
  const toInvestors = (amount: bigint): Allocation[] =>
    proRata(amount, investors.map((i) => i.weight)).map((a, n) => ({ beneficiary: investors[n].beneficiary, amount: Number(a) }));

  let left = BigInt(input.proceeds);
  const take = (claim: bigint) => {
    const paid = min(left, claim);
    left -= paid;
    return paid;
  };

  const debtClaim = BigInt(input.integratorDebt);
  const debt = take(debtClaim);
  const capitalPaid = take(capital);
  const preferredClaim = BigInt(compoundedFloor(Number(capital), rateBps, input.days)) - capital;
  const preferred = take(preferredClaim);
  const contributionClaim = BigInt(input.producerContribution);
  const contribution = take(contributionClaim);
  const surplus = take(left);

  const surplusInvestors = (surplus * BigInt(split.investors)) / 100n;
  const surplusPlatform = (surplus * BigInt(split.platform)) / 100n;
  const surplusProducer = surplus - surplusInvestors - surplusPlatform;

  const tiers: Tier[] = [
    { tier: TIER.INTEGRATOR_DEBT, claim: Number(debtClaim), paid: Number(debt), allocations: debtClaim > 0n ? [{ beneficiary: INTEGRATOR, amount: Number(debt) }] : [] },
    { tier: TIER.INVESTOR_CAPITAL, claim: Number(capital), paid: Number(capitalPaid), allocations: toInvestors(capitalPaid) },
    { tier: TIER.PREFERRED_RETURN, claim: Number(preferredClaim), paid: Number(preferred), allocations: toInvestors(preferred) },
    {
      tier: TIER.PRODUCER_CONTRIBUTION,
      claim: Number(contributionClaim),
      paid: Number(contribution),
      allocations: contributionClaim > 0n ? [{ beneficiary: PRODUCER, amount: Number(contribution) }] : [],
    },
    {
      tier: TIER.SURPLUS,
      claim: null,
      paid: Number(surplus),
      allocations: [...toInvestors(surplusInvestors), { beneficiary: PRODUCER, amount: Number(surplusProducer) }, { beneficiary: PLATFORM, amount: Number(surplusPlatform) }],
    },
  ];

  const totals = new Map<string, Allocation>();
  const keyOf = (b: Beneficiary) => `${b.kind}:${b.id}`;
  for (const a of tiers.flatMap((t) => t.allocations)) {
    const current = totals.get(keyOf(a.beneficiary));
    totals.set(keyOf(a.beneficiary), { beneficiary: a.beneficiary, amount: (current?.amount ?? 0) + a.amount });
  }

  const distributed = tiers.reduce((s, t) => s + t.paid, 0);
  if (distributed !== input.proceeds || [...totals.values()].some((t) => t.amount < 0)) throw new Error("Liquidation invariant broken");

  return {
    tiers,
    totals: [...totals.values()],
    investorsTotal: Number(capitalPaid + preferred + surplusInvestors),
    shortfall: Number(debtClaim - debt + (capital - capitalPaid) + (preferredClaim - preferred) + (contributionClaim - contribution)),
  };
}
