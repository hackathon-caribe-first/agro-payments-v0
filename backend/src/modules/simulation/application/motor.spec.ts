import { computeLiquidation } from "../../settlement/application/liquidation";
import {
  admission,
  breakeven,
  budgets,
  coverage,
  currencyTir,
  equilibriumRate,
  insurancePremium,
  investorsTotal,
  LEVEL,
  minimumCapital,
  MOTOR_VERSION,
  PRICE_KIND,
  simulate,
  type SimulationInputs,
  tirFromMultiple,
} from "./motor";
import { PRESETS } from "./presets";

// Money in: whole pesos. Money out: COP minor units (assetScale 2). Oracle numbers are the PRD v3 worked examples
// (Motor de simulación, Capital extranjero, Anexo A) or hand computations written next to each case.
const P1 = PRESETS.P1.inputs;
const P2 = PRESETS.P2.inputs;
const small = (inputs: SimulationInputs, runs = 2_000): SimulationInputs => ({ ...inputs, runs });

describe("A1 · cost and milestone budgets P_j = δ_j·(C − V_prod)·(1 + κ)", () => {
  it("P1 maíz: C = 20 ha × 7,5 M = 150 M, κ = 5 % → 157,5 M split 60/25/15", () => {
    const b = budgets(P1, LEVEL.B);
    expect(b.cost).toBe(15_000_000_000);
    expect(b.producerContribution).toBe(0);
    expect(b.total).toBe(15_750_000_000);
    expect(b.milestones.map((m) => m.budget)).toEqual([9_450_000_000, 3_937_500_000, 2_362_500_000]);
    expect(b.milestones.map((m) => m.day)).toEqual([0, 45, 110]);
  });

  it("splits each budget into supplies, labor (A/B only), the 3 % fee (D-06) and the κ reserve; the parts sum to P_j", () => {
    const [, m2] = budgets(P1, LEVEL.B).milestones;
    // PRD "Split del hito" example: fee 3 % of the milestone, labor 14,4 %; κ/(1 + κ) of P_j is the contingency reserve.
    expect(m2).toMatchObject({ fee: 118_125_000, labor: 567_000_000, contingency: 187_500_000, supplies: 3_064_875_000 });
    expect(m2.supplies + m2.labor + m2.fee + m2.contingency).toBe(m2.budget);
  });

  it("has no labor line in level C and first cycle", () => {
    for (const level of [LEVEL.C, LEVEL.FIRST_CYCLE]) expect(budgets(P1, level).milestones.every((m) => m.labor === 0)).toBe(true);
  });

  it("P2 tomate: C = 80 M, V_prod 10 % → (C − V_prod)(1 + κ) = 75,6 M split 50/30/20, and Σ P_j is exact", () => {
    const b = budgets(P2, LEVEL.B);
    expect(b.producerContribution).toBe(800_000_000);
    expect(b.milestones.map((m) => m.budget)).toEqual([3_780_000_000, 2_268_000_000, 1_512_000_000]);
    expect(b.milestones.reduce((s, m) => s + m.budget, 0)).toBe(b.total);
  });

  it("gives the rounding remainder to the largest share so Σ P_j is the rounded total", () => {
    const b = budgets({ ...P2, costPerHectare: 1_000_001, milestones: [0, 1, 2].map((i) => ({ ...P2.milestones[0], day: i, sharePct: 100 / 3 })) }, LEVEL.B);
    expect(b.milestones.reduce((s, m) => s + m.budget, 0)).toBe(b.total);
  });
});

describe("A2 · insurance premium H·P_seg·(1 − σ_ISA) and minimum capital K", () => {
  it("prices the ISA premium on the guaranteed value 70 % · Y · (1 − λ) · P_g", () => {
    // P2: 0,70 × 85.000 kg × 0,92 × 1.300 = 71.162.000; × 6 % × (1 − 85 %) = 640.458
    expect(insurancePremium(P2)).toBe(64_045_800);
    // P1: 20 ha × 0,70 × 8.000 × 0,97 × 1.050 = 114.072.000; × 6 % × 15 % = 1.026.648
    expect(insurancePremium(P1)).toBe(102_664_800);
  });

  it("with r_f = 0 (demo, D-15) K = Σ P_j + premium: P2 76,24 M (PRD 76,2 M), P1 158,53 M (PRD ≈ 157,9 M in demo mode)", () => {
    expect(minimumCapital(P2, budgets(P2, LEVEL.B))).toBe(7_624_045_800);
    expect(minimumCapital(P1, budgets(P1, LEVEL.B))).toBe(15_852_664_800);
  });

  it("with r_f > 0 K is the least capital whose custody balance B_t never goes negative", () => {
    const inputs: SimulationInputs = { ...P1, fiduciaryYieldPct: 8.9, fiduciaryMonthlyFee: 420_000 };
    const b = budgets(inputs, LEVEL.B);
    const k = minimumCapital(inputs, b);
    const i = (1 + 0.089) ** (1 / 365) - 1;
    const lowest = (capital: number) => {
      let balance = capital - insurancePremium(inputs);
      let low = balance;
      for (let t = 0; t <= inputs.days; t++) {
        if (t > 0) balance *= 1 + i;
        balance -= b.milestones.filter((m) => m.day === t).reduce((s, m) => s + m.budget, 0);
        if (t > 0 && t % 30 === 0) balance -= 42_000_000;
        low = Math.min(low, balance);
      }
      return low;
    };
    expect(lowest(k)).toBeGreaterThanOrEqual(-0.5);
    expect(lowest(k - 100)).toBeLessThan(0);
    expect(k).toBeLessThan(15_852_664_800 + 5 * 42_000_000);
  });
});

describe("A15 · admission score and level", () => {
  it("weights the seven blocks 20/20/20/15/10/10/5 and maps the score to a level", () => {
    expect(admission({ filters: Array(9).fill(true), blocks: [70, 60, 70, 65, 60, 55, 60] })).toMatchObject({ score: 64.25, level: LEVEL.B, passesFilters: true });
    const level = (x: number) => admission({ filters: Array(9).fill(true), blocks: Array(7).fill(x) }).level;
    expect([level(75), level(74.99), level(60), level(59.99), level(50), level(49.99)]).toEqual([LEVEL.A, LEVEL.B, LEVEL.B, LEVEL.C, LEVEL.C, LEVEL.FIRST_CYCLE]);
  });

  it("zeroes the score when any of the nine elimination filters fails (RF-02) and names it", () => {
    const filters = Array(9).fill(true);
    filters[2] = false;
    const result = admission({ filters, blocks: Array(7).fill(90) });
    expect(result).toMatchObject({ score: 0, passesFilters: false, level: LEVEL.FIRST_CYCLE });
    expect(result.failedFilters).toEqual(["Lote en páramo o área protegida"]);
  });
});

describe("A9 · returns per currency and equilibrium TRM (PRD «Lo que muestra la ficha al inversionista en dólares»)", () => {
  it("TIR_COP = m^(365/d) − 1: P1 101 % over 150 d → 2,4 %; P2 109,3 % over 120 d → ≈ 30,9 %", () => {
    expect(tirFromMultiple(1.01, 150)).toBeCloseTo(0.0245, 3);
    expect(tirFromMultiple(1.0925, 120)).toBeCloseTo(0.309, 2);
    expect(tirFromMultiple(0, 120)).toBe(-1);
  });

  it("TIR in USD at exit TRM 3.000 / 3.359 / 3.600 from an entry TRM of 3.218,75", () => {
    // The PRD prints one decimal of rounded multiples (101,0 %, 109,3 %): agree within 0,1 points.
    const usd = (m: number, d: number, exit: number) => currencyTir(m, 3218.75, exit, d) * 100;
    const p1 = [usd(1.01, 150, 3000), usd(1.01, 150, 3359), usd(1.01, 150, 3600)];
    const p2 = [usd(1.0925, 120, 3000), usd(1.0925, 120, 3359), usd(1.0925, 120, 3600)];
    [21.6, -7.7, -22.0].forEach((prd, i) => expect(Math.abs(p1[i] - prd)).toBeLessThanOrEqual(0.1));
    [62.1, 15.0, -6.9].forEach((prd, i) => expect(Math.abs(p2[i] - prd)).toBeLessThanOrEqual(0.1));
  });

  it("TRM* = TRM_0 · X_INV / K_INV: 3.251 for P1, 3.518 for P2", () => {
    expect(Math.round(equilibriumRate(1.01, 3218.75))).toBe(3251);
    expect(Math.round(equilibriumRate(1.093, 3218.75))).toBe(3518);
  });
});

describe("A8 · investors' total X_INV per run follows the settlement cascade", () => {
  const terms = { investorCapital: 100_000_000, debt: 10_000_000, preferredRatePct: 12, days: 365, producerContribution: 20_000_000 };
  it.each([0, 5_000_000, 60_000_000, 115_000_000, 125_000_000, 200_000_000, 1_000_000_000])("L = %d matches computeLiquidation within a peso", (proceeds) => {
    const plan = computeLiquidation({
      proceeds: proceeds * 100,
      integratorDebt: terms.debt * 100,
      investors: [{ id: "k", capital: terms.investorCapital * 100 }],
      producerContribution: terms.producerContribution * 100,
      days: terms.days,
    });
    expect(Math.abs(investorsTotal(proceeds, terms) - plan.investorsTotal / 100)).toBeLessThanOrEqual(1);
  });
});

describe("A11 · coverage and breakeven", () => {
  it("Cob = L / (K_INV·(1 + h)^(d/365) + X_D)", () => {
    expect(coverage(112, 100, 12, 365, 0)).toBeCloseTo(1, 10);
    expect(coverage(130, 100, 12, 365, 18)).toBeCloseTo(1, 10);
  });

  it("Y_be = C / (H·P(1 − λ)), P_be = C / (H·Y(1 − λ)) and the yield safety margin (P2)", () => {
    const b = breakeven(P2);
    expect(b.yieldKgPerHa).toBeCloseTo(66_889.6, 1);
    expect(b.pricePerKg).toBe(102_302);
    expect(b.safetyMarginPct).toBeCloseTo(21.31, 2);
  });
});

describe("A5–A7 · harvest, ISA indemnity and cash at liquidation in a forced catastrophe", () => {
  it("every run loses 80 % of the yield: indemnity pays, the κ reserve is spent and X_INV = L", () => {
    const sheet = simulate({ ...small(P2, 200), catastropheProbabilityPct: 100, catastropheMinPct: 80, catastropheMaxPct: 80, yieldNoisePct: 0 });
    // Y = 17.000 kg: I = 17.000 × 0,92 × 1.300 = 20.332.000; Ind = (59.500 − 17.000) × 0,92 × 1.300 − 10 % × 71.162.000 = 43.713.800
    // L = 64.045.800 < K_INV = 76.240.458 → recovery 84,005 %, TIR = 0,84005^(365/120) − 1 = −41,14 %
    expect(sheet.monteCarlo.recoveryPct.median).toBeCloseTo(84.0, 1);
    expect(sheet.monteCarlo.tirPct.median).toBeCloseTo(-41.14, 1);
    expect(sheet.monteCarlo.probCapitalLossPct).toBe(100);
  });
});

describe("A12 · Monte Carlo with a fixed seed and the offer rule (RF-06, RF-07, RNF-11)", () => {
  it("is byte-identical for the same inputs and seed, and records the motor version", () => {
    const a = JSON.stringify(simulate(small(P2)));
    expect(JSON.stringify(simulate(small(P2)))).toBe(a);
    expect(JSON.stringify(simulate({ ...small(P2), seed: 1 }))).not.toBe(a);
    expect(simulate(small(P2)).motorVersion).toBe(MOTOR_VERSION);
  });

  it("P1 maíz at 1,05 M/t is NOT publishable: the median misses 12 % and coverage misses 1,3; it returns the minimum contract price", () => {
    const sheet = simulate(small(P1));
    expect(sheet.offer.publishable).toBe(false);
    expect(sheet.offer.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["median_below_offer", "coverage_base"]));
    expect(sheet.monteCarlo.tirPct.median).toBeLessThan(12);
    expect(sheet.coverage.base).toBeLessThan(1.3);
    // A12 (median rule only): PRD ≈ 1,126 M/t; this demo-mode port lands within 7 %.
    const median = sheet.offer.medianMinimumContractPricePerKg as number;
    expect(Math.abs(median / 100 - 1126) / 1126).toBeLessThan(0.07);
    expect(sheet.offer.minimumContractPricePerKg as number).toBeGreaterThanOrEqual(median);
    expect(sheet.offer.minimumContractPricePerKg as number).toBeGreaterThan(sheet.offer.contractPricePerKg);
    expect(sheet.admission.level).toBe(LEVEL.B);
  });

  it("re-running P1 at the returned minimum price makes it publishable", () => {
    const price = (simulate(small(P1)).offer.minimumContractPricePerKg as number) / 100;
    expect(simulate({ ...small(P1), price: { kind: PRICE_KIND.FIXED, perKg: price } }).offer.publishable).toBe(true);
    expect(simulate({ ...small(P1), price: { kind: PRICE_KIND.FIXED, perKg: price - 1 } }).offer.publishable).toBe(false);
  });

  it("P2 tomate at COP 1.300/kg IS publishable at level B with 3 milestones and a COP + USD + EUR sheet", () => {
    const sheet = simulate(small(P2));
    expect(sheet.offer).toMatchObject({ publishable: true, reasons: [] });
    expect(sheet.admission).toMatchObject({ level: LEVEL.B, passesFilters: true });
    expect(sheet.milestones).toHaveLength(3);
    expect(sheet.coverage.base).toBeGreaterThanOrEqual(1.3);
    expect(sheet.coverage.stress).toBeGreaterThanOrEqual(1);
    expect(sheet.monteCarlo.tirPct.median).toBeGreaterThanOrEqual(12);
    expect(sheet.currencies.map((c) => c.currency)).toEqual(["USD", "EUR"]);
    const usd = sheet.currencies[0];
    expect(usd.exits.map((e) => e.exitRate)).toEqual([3000, 3359, 3600]);
    // Devaluation hurts the dollar investor: TIR falls as the exit TRM rises, and TRM* sits above the entry rate.
    expect(usd.exits[0].tirBasePct).toBeGreaterThan(usd.exits[2].tirBasePct);
    expect(usd.equilibriumRate).toBeCloseTo(3218.75 * (sheet.base.recoveryPct / 100), 0);
    expect(sheet.monteCarlo.probCapitalLossPct).toBeLessThan(15);
  });

  it("is not publishable when the offered return exceeds the median, nor when an elimination filter fails", () => {
    expect(simulate({ ...small(P2), offeredReturnPct: 500 }).offer.reasons.map((r) => r.code)).toEqual(["median_below_offer"]);
    const filters = Array(9).fill(true);
    filters[0] = false;
    const sheet = simulate({ ...small(P2), admission: { ...P2.admission, filters } });
    expect(sheet.offer.publishable).toBe(false);
    expect(sheet.offer.reasons.map((r) => r.code)).toContain("admission_filters");
  });

  it("flags a milestone count outside the level's range", () => {
    const sheet = simulate({ ...small(P2), milestones: [{ ...P2.milestones[0], sharePct: 100 }] });
    expect(sheet.offer.reasons.map((r) => r.code)).toContain("milestone_count");
  });

  it("in production mode (τ 2,25 %, C_log 25.000/t, r_f 8,9 %, G_mes 0,42 M) lands near the PRD's demo-project table", () => {
    // The PRD table («Proyecto de demo») was produced in production mode; D-15 runs the demo without those costs.
    const production = (inputs: SimulationInputs) =>
      simulate({ ...inputs, runs: 20_000, parafiscalPct: 0.75, withholdingPct: 1.5, logisticsPerTonne: 25_000, fiduciaryYieldPct: 8.9, fiduciaryMonthlyFee: 420_000 });
    const p1 = production(P1);
    expect(Math.abs(p1.base.recoveryPct - 101.0)).toBeLessThan(1.5); // 102,2
    expect(Math.abs(p1.monteCarlo.probCapitalLossPct - 56)).toBeLessThan(6); // 51,5
    expect(p1.monteCarlo.tirPct.median).toBeLessThan(0); // PRD −5,5 %; port −1,7 %
    expect(Math.abs((p1.offer.medianMinimumContractPricePerKg as number) / 100 - 1126) / 1126).toBeLessThan(0.02); // 1.110
    const p2 = production(P2);
    expect(Math.abs(p2.base.recoveryPct - 109.3)).toBeLessThan(3); // 112,0
    expect(Math.abs(p2.monteCarlo.probCapitalLossPct - 12)).toBeLessThan(3); // 10,0
  });

  it("runs the full 20.000 scenarios deterministically", () => {
    const full = { ...P2, runs: 20_000 };
    const a = simulate(full);
    expect(a.runs).toBe(20_000);
    expect(JSON.stringify(simulate(full))).toBe(JSON.stringify(a));
  });

  it("rejects inputs that would break the equations", () => {
    expect(() => simulate({ ...P2, milestones: [{ ...P2.milestones[0], sharePct: 50 }] })).toThrow(/100/);
    expect(() => simulate({ ...P2, days: 0 })).toThrow();
    expect(() => simulate({ ...P2, runs: 0 })).toThrow();
  });
});
