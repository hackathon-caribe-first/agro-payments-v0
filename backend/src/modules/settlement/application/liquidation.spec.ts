import { DomainError } from "../../../shared/domain-errors";
import { compoundedFloor, computeLiquidation, type LiquidationInput, type LiquidationPlan, TIER } from "./liquidation";

// Amounts are integer minor units (COP, assetScale 2). Oracle values for the preferred return were computed with
// 80-digit decimal arithmetic: floor(K·1.12^(d/365)) − K.
const base: LiquidationInput = {
  proceeds: 0,
  integratorDebt: 0,
  investors: [{ id: "inv-a", capital: 100_000_000 }],
  producerContribution: 0,
  days: 365,
};

const tier = (plan: LiquidationPlan, kind: string) => {
  const t = plan.tiers.find((x) => x.tier === kind);
  if (!t) throw new Error(`no tier ${kind}`);
  return t;
};
const total = (plan: LiquidationPlan, id: string) => plan.totals.find((t) => t.beneficiary.id === id)?.amount;
const sumOf = (plan: LiquidationPlan) => plan.tiers.flatMap((t) => t.allocations).reduce((s, a) => s + a.amount, 0);

describe("compoundedFloor (K·(1 + h)^(d/365), floored, exact integer math)", () => {
  it.each([
    { principal: 100_000_000, days: 0, expected: 100_000_000 },
    { principal: 100_000_000, days: 365, expected: 112_000_000 },
    { principal: 100_000_000, days: 730, expected: 125_440_000 },
    { principal: 100_000_000, days: 180, expected: 105_747_936 },
    { principal: 1_000_000, days: 1, expected: 1_000_310 },
    { principal: 7_620_000_000, days: 120, expected: 7_909_267_044 },
    { principal: 0, days: 120, expected: 0 },
  ])("$principal over $days days at 12 % E.A. → $expected", ({ principal, days, expected }) => {
    expect(compoundedFloor(principal, 1200, days)).toBe(expected);
  });
});

describe("computeLiquidation: cascade order X_D → X_1 → X_2 → X_3 → E (PRD v3 Cascada de liquidación, A8)", () => {
  const full: LiquidationInput = {
    proceeds: 200_000_000,
    integratorDebt: 10_000_000,
    investors: [{ id: "inv-a", capital: 100_000_000 }],
    producerContribution: 20_000_000,
    days: 365,
  };

  it("pays every tier in full and splits the surplus 50/30/20 investors/producer/platform", () => {
    const plan = computeLiquidation(full);
    expect(plan.tiers.map((t) => [t.tier, t.claim, t.paid])).toEqual([
      [TIER.INTEGRATOR_DEBT, 10_000_000, 10_000_000],
      [TIER.INVESTOR_CAPITAL, 100_000_000, 100_000_000],
      [TIER.PREFERRED_RETURN, 12_000_000, 12_000_000],
      [TIER.PRODUCER_CONTRIBUTION, 20_000_000, 20_000_000],
      [TIER.SURPLUS, null, 58_000_000],
    ]);
    expect(tier(plan, TIER.SURPLUS).allocations).toEqual([
      { beneficiary: { kind: "investor", id: "inv-a" }, amount: 29_000_000 },
      { beneficiary: { kind: "producer", id: "producer" }, amount: 17_400_000 },
      { beneficiary: { kind: "platform", id: "platform" }, amount: 11_600_000 },
    ]);
    expect(plan.totals).toEqual([
      { beneficiary: { kind: "integrator", id: "integrator" }, amount: 10_000_000 },
      { beneficiary: { kind: "investor", id: "inv-a" }, amount: 141_000_000 },
      { beneficiary: { kind: "producer", id: "producer" }, amount: 37_400_000 },
      { beneficiary: { kind: "platform", id: "platform" }, amount: 11_600_000 },
    ]);
    expect(plan.investorsTotal).toBe(141_000_000);
    expect(plan.shortfall).toBe(0);
    expect(sumOf(plan)).toBe(full.proceeds);
  });

  // Shortfall at each tier: the tier takes what is left, later tiers get 0, investors bear the loss (D-04).
  it.each([
    {
      name: "nothing to distribute",
      proceeds: 0,
      paid: [0, 0, 0, 0, 0],
      shortfall: 142_000_000,
    },
    {
      name: "short inside the integrator debt",
      proceeds: 4_000_000,
      paid: [4_000_000, 0, 0, 0, 0],
      shortfall: 138_000_000,
    },
    {
      name: "exactly the integrator debt",
      proceeds: 10_000_000,
      paid: [10_000_000, 0, 0, 0, 0],
      shortfall: 132_000_000,
    },
    {
      name: "short inside investor capital",
      proceeds: 70_000_000,
      paid: [10_000_000, 60_000_000, 0, 0, 0],
      shortfall: 72_000_000,
    },
    {
      name: "short inside the preferred return",
      proceeds: 115_000_000,
      paid: [10_000_000, 100_000_000, 5_000_000, 0, 0],
      shortfall: 27_000_000,
    },
    {
      name: "short inside the producer contribution",
      proceeds: 130_000_000,
      paid: [10_000_000, 100_000_000, 12_000_000, 8_000_000, 0],
      shortfall: 12_000_000,
    },
    {
      name: "every claim met, no surplus",
      proceeds: 142_000_000,
      paid: [10_000_000, 100_000_000, 12_000_000, 20_000_000, 0],
      shortfall: 0,
    },
  ])("$name", ({ proceeds, paid, shortfall }) => {
    const plan = computeLiquidation({ ...full, proceeds });
    expect(plan.tiers.map((t) => t.paid)).toEqual(paid);
    expect(plan.shortfall).toBe(shortfall);
    expect(sumOf(plan)).toBe(proceeds);
    expect(plan.totals.every((t) => t.amount >= 0)).toBe(true);
  });

  it("omits the integrator when there is no debt and gives the producer contribution tier no claim when V_prod = 0", () => {
    const plan = computeLiquidation({ ...base, proceeds: 120_000_000 });
    expect(plan.tiers.map((t) => [t.tier, t.claim, t.paid])).toEqual([
      [TIER.INTEGRATOR_DEBT, 0, 0],
      [TIER.INVESTOR_CAPITAL, 100_000_000, 100_000_000],
      [TIER.PREFERRED_RETURN, 12_000_000, 12_000_000],
      [TIER.PRODUCER_CONTRIBUTION, 0, 0],
      [TIER.SURPLUS, null, 8_000_000],
    ]);
    expect(plan.totals.map((t) => t.beneficiary.kind)).toEqual(["investor", "producer", "platform"]);
  });

  it("splits each investor tier pro rata to capital", () => {
    const plan = computeLiquidation({
      ...base,
      investors: [
        { id: "inv-a", capital: 60_000_000 },
        { id: "inv-b", capital: 40_000_000 },
      ],
      proceeds: 132_000_000,
    });
    expect(tier(plan, TIER.INVESTOR_CAPITAL).allocations.map((a) => a.amount)).toEqual([60_000_000, 40_000_000]);
    expect(tier(plan, TIER.PREFERRED_RETURN).allocations.map((a) => a.amount)).toEqual([7_200_000, 4_800_000]);
    // E = 20 M: investors 10 M (6 M / 4 M), producer 6 M, platform 4 M.
    expect(total(plan, "inv-a")).toBe(73_200_000);
    expect(total(plan, "inv-b")).toBe(48_800_000);
    expect(total(plan, "producer")).toBe(6_000_000);
    expect(total(plan, "platform")).toBe(4_000_000);
  });

  it("shares a capital shortfall pro rata, so every investor loses the same fraction", () => {
    const plan = computeLiquidation({
      ...base,
      investors: [
        { id: "inv-a", capital: 75_000_000 },
        { id: "inv-b", capital: 25_000_000 },
      ],
      proceeds: 80_000_000,
    });
    expect(tier(plan, TIER.INVESTOR_CAPITAL).allocations.map((a) => a.amount)).toEqual([60_000_000, 20_000_000]);
    expect(total(plan, "producer")).toBe(0);
    expect(total(plan, "platform")).toBe(0);
  });

  describe("rounding in minor units", () => {
    it("gives the leftover units of a pro rata tier to the largest remainders, ties to the earlier investor", () => {
      const plan = computeLiquidation({
        ...base,
        investors: [
          { id: "a", capital: 1 },
          { id: "b", capital: 1 },
          { id: "c", capital: 1 },
        ],
        days: 0,
        proceeds: 2,
      });
      // 2 units over three equal stakes: floors are 0, remainders tie, input order breaks the tie.
      expect(tier(plan, TIER.INVESTOR_CAPITAL).allocations.map((a) => a.amount)).toEqual([1, 1, 0]);
    });

    it("prefers the larger remainder over input order", () => {
      const plan = computeLiquidation({
        ...base,
        investors: [
          { id: "a", capital: 1 },
          { id: "b", capital: 2 },
        ],
        days: 0,
        proceeds: 2,
      });
      // 2·1/3 = 0.67, 2·2/3 = 1.33: floors 0 + 1, the leftover unit goes to a (remainder 2/3 > 1/3).
      expect(tier(plan, TIER.INVESTOR_CAPITAL).allocations.map((a) => a.amount)).toEqual([1, 1]);
    });

    it("floors the investor and platform surplus shares and gives the leftover unit to the producer", () => {
      // E = 7: investors floor(3.5) = 3, platform floor(1.4) = 1, producer 7 − 3 − 1 = 3.
      const plan = computeLiquidation({ ...base, investors: [{ id: "a", capital: 10 }], days: 0, proceeds: 17 });
      expect(tier(plan, TIER.SURPLUS).allocations.map((a) => [a.beneficiary.id, a.amount])).toEqual([
        ["a", 3],
        ["producer", 3],
        ["platform", 1],
      ]);
      expect(sumOf(plan)).toBe(17);
    });

    it("keeps sum == proceeds and no negatives on awkward numbers", () => {
      const input: LiquidationInput = {
        proceeds: 987_654_321,
        integratorDebt: 12_345_677,
        investors: [
          { id: "a", capital: 333_333_333 },
          { id: "b", capital: 111_111_111 },
          { id: "c", capital: 7 },
        ],
        producerContribution: 55_555_555,
        days: 137,
      };
      const plan = computeLiquidation(input);
      expect(sumOf(plan)).toBe(input.proceeds);
      expect(plan.totals.reduce((s, t) => s + t.amount, 0)).toBe(input.proceeds);
      expect(plan.tiers.flatMap((t) => t.allocations).every((a) => Number.isSafeInteger(a.amount) && a.amount >= 0)).toBe(true);
    });
  });

  it("uses the time-scaled preferred return K_INV·[(1 + h)^(d/365) − 1], not a flat 12 %", () => {
    const plan = computeLiquidation({ ...base, days: 180, proceeds: 200_000_000 });
    expect(tier(plan, TIER.PREFERRED_RETURN).claim).toBe(5_747_936);
  });

  it("accepts another preferred rate and surplus split as parameters", () => {
    const plan = computeLiquidation({
      ...base,
      proceeds: 120_000_000,
      preferredRateBps: 1000,
      surplusSplitPct: { investors: 40, producer: 40, platform: 20 },
    });
    expect(tier(plan, TIER.PREFERRED_RETURN).claim).toBe(10_000_000);
    expect(tier(plan, TIER.SURPLUS).allocations.map((a) => a.amount)).toEqual([4_000_000, 4_000_000, 2_000_000]);
  });

  // PRD v3 Motor de simulación, P2 tomate: K = COP 76,2 M, d = 120, V_prod = 10 % of C (80 M), expected recovery 109,3 %.
  // L is chosen so X_INV / K_INV = 1.093 exactly; the preferred return 2.892.670,44 is K·(1.12^(120/365) − 1).
  it("reproduces the P2 tomato ficha: 109.3 % recovery for the investors", () => {
    const plan = computeLiquidation({
      proceeds: 9_548_052_956,
      integratorDebt: 0,
      investors: [{ id: "inv-p2", capital: 7_620_000_000 }],
      producerContribution: 800_000_000,
      days: 120,
    });
    expect(tier(plan, TIER.PREFERRED_RETURN).paid).toBe(289_267_044);
    expect(tier(plan, TIER.SURPLUS).paid).toBe(838_785_912);
    expect(plan.investorsTotal).toBe(8_328_660_000);
    expect(plan.investorsTotal / 7_620_000_000).toBeCloseTo(1.093, 10);
    expect(total(plan, "producer")).toBe(800_000_000 + 251_635_774);
    expect(total(plan, "platform")).toBe(167_757_182);
  });

  describe("rejects inputs the cascade cannot settle", () => {
    it.each([
      { name: "negative proceeds", input: { ...base, proceeds: -1 } },
      { name: "fractional proceeds", input: { ...base, proceeds: 1.5 } },
      { name: "unsafe proceeds", input: { ...base, proceeds: Number.MAX_SAFE_INTEGER + 2 } },
      { name: "negative debt", input: { ...base, integratorDebt: -1 } },
      { name: "negative producer contribution", input: { ...base, producerContribution: -1 } },
      { name: "no investors", input: { ...base, investors: [] } },
      { name: "zero capital", input: { ...base, investors: [{ id: "a", capital: 0 }] } },
      { name: "duplicate investor", input: { ...base, investors: [{ id: "a", capital: 1 }, { id: "a", capital: 2 }] } },
      { name: "negative days", input: { ...base, days: -1 } },
      { name: "split not summing to 100", input: { ...base, surplusSplitPct: { investors: 50, producer: 30, platform: 10 } } },
    ])("$name", ({ input }) => {
      expect(() => computeLiquidation(input)).toThrow(DomainError);
    });
  });
});
