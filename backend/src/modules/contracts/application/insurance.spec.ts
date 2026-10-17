import { RejectedError } from "../../../shared/domain-errors";
import { simulate } from "../../simulation/application/motor";
import { PRESETS } from "../../simulation/application/presets";
import { CLAIM_TRIGGER, indemnity, netPremium, type PolicyTerms, sumInsured, termsFromSimulation, thresholdYield } from "./insurance";

// 10 ha, 1.000 kg/ha expected, no shrinkage, 1.000 pesos/kg: Y_gat 700 kg/ha, guaranteed value 700.000 pesos/ha.
const terms = (overrides: Partial<PolicyTerms> = {}): PolicyTerms => ({
  hectares: 10,
  expectedYieldKgPerHa: 1_000,
  shrinkagePct: 0,
  insuredPricePerKg: 100_000,
  thresholdPct: 70,
  deductiblePct: 10,
  grossPremium: 100_000_000,
  subsidyPct: 85,
  netPremium: 15_000_000,
  indexTrigger: 100,
  indexExit: 50,
  ...overrides,
});

describe("insurance (RF-05, Anexo A6)", () => {
  it("nets the ISA subsidy off the premium, in whole pesos", () => {
    expect(netPremium(100_000_000, 85)).toBe(15_000_000);
    // 1.234.567,89 × 0,15 = 185.185,18 → 185.185 pesos
    expect(netPremium(123_456_789, 85)).toBe(18_518_500);
  });

  it("derives the threshold yield and the sum insured from the guaranteed value", () => {
    expect(thresholdYield(terms())).toBe(700);
    expect(sumInsured(terms())).toBe(700_000_000);
  });

  it("indemnifies a yield below the threshold: H·max(0, (Y_gat − Y_real)(1 − λ)P − Ded)", () => {
    expect(indemnity(terms(), { trigger: CLAIM_TRIGGER.YIELD, observedValue: 500 })).toBe(130_000_000);
  });

  it("refuses a yield claim at or above the threshold, or one the deductible absorbs", () => {
    expect(() => indemnity(terms(), { trigger: CLAIM_TRIGGER.YIELD, observedValue: 700 })).toThrow(RejectedError);
    expect(() => indemnity(terms(), { trigger: CLAIM_TRIGGER.YIELD, observedValue: 650 })).toThrow(/deducible/);
  });

  it("indemnifies the parametric index: SA·min(1, max(0, (Trig − Idx)/(Trig − Exit)))", () => {
    expect(indemnity(terms(), { trigger: CLAIM_TRIGGER.INDEX, observedValue: 75 })).toBe(350_000_000);
    expect(indemnity(terms(), { trigger: CLAIM_TRIGGER.INDEX, observedValue: 10 })).toBe(700_000_000);
  });

  it("refuses an index claim that did not cross the trigger, or a policy without an index", () => {
    expect(() => indemnity(terms(), { trigger: CLAIM_TRIGGER.INDEX, observedValue: 100 })).toThrow(/disparo/);
    expect(() => indemnity(terms({ indexTrigger: null, indexExit: null }), { trigger: CLAIM_TRIGGER.INDEX, observedValue: 10 })).toThrow(/índice/);
  });

  it("takes the premium and terms from a simulation run: the net premium is the sheet's", () => {
    const inputs = { ...PRESETS.P2.inputs, runs: 200 };
    const sheet = simulate(inputs);
    const fromRun = termsFromSimulation(inputs, sheet);
    expect(fromRun).toMatchObject({ hectares: 1, expectedYieldKgPerHa: 85_000, shrinkagePct: 8, insuredPricePerKg: 130_000, thresholdPct: 70, deductiblePct: 10, subsidyPct: 85 });
    expect(fromRun.netPremium).toBe(64_045_800);
    expect(sheet.capital.insurancePremium).toBe(64_045_800);
    expect(fromRun.grossPremium).toBe(426_972_000);
  });
});
