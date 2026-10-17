import { applyLineResult, fund, review, submitEvidence } from "../../milestones/application/milestone";
import { unfundedMilestone } from "../../milestones/application/testing";
import { sampleProject } from "../../investments/application/testing";
import type { Investment } from "../../investments/domain/investment";
import { applyPayoutResult, approveSettlement, startExecution, type Settlement } from "../../settlement/application/settlement";
import { sampleSettlement } from "../../settlement/application/testing";
import { custodyStatement, medianReturns, milestoneGrant, realizedReturns } from "./panel";

const at = new Date("2027-03-01T12:00:00Z");

const investment = (overrides: Partial<Investment> = {}): Investment => ({
  id: "inv-eur",
  projectId: "p1",
  investorUserId: "u-inv",
  walletAddress: "https://wallet.test/inversionista-eur",
  status: "CAPTURED",
  failureReason: null,
  amount: 40_000_000,
  currency: "COP",
  assetScale: 2,
  quote: { id: "q", debitAmount: 9_091, debitAssetCode: "EUR", debitAssetScale: 2, receiveAmount: 40_000_000, expiresAt: null },
  impliedRate: "4400/1",
  incomingPaymentId: null,
  outgoingPaymentId: "out",
  createdAt: at,
  capturedAt: at,
  ...overrides,
});

/** sampleSettlement (L = 200 M, one year) executed; the EUR investor's payout reports what their wallet received. */
function executed(eurReceived: number | null): Settlement {
  let s = startExecution(approveSettlement(sampleSettlement(), "u-fidu", at));
  for (const p of s.payouts) {
    const receipt = p.id === "investor-inv-eur" && eurReceived !== null ? { receiveAmount: { value: eurReceived, assetCode: "EUR", assetScale: 2 } } : undefined;
    s = applyPayoutResult(s, p.id, { status: "completado", reference: `REF-${p.id}`, receipt }, at);
  }
  return s;
}

describe("milestoneGrant (RF-27: each milestone's grant, spent against its cap)", () => {
  it("is pending before funding, active while open and revoked once closed, with what its lines took from custody", () => {
    const pending = unfundedMilestone();
    expect(milestoneGrant(pending)).toMatchObject({ status: "pending", cap: 1_000_000, spent: 0, remaining: 1_000_000 });
    let m = fund(unfundedMilestone(), at);
    expect(milestoneGrant(m).status).toBe("active");
    m = review(submitEvidence(m, "Fotos", at), "approved", null, at);
    for (const line of m.lines) m = applyLineResult(m, line.id, { status: "completado", reference: `R-${line.id}` }, at);
    const grant = milestoneGrant(m);
    expect(m.closedAt).not.toBeNull();
    expect(grant.status).toBe("revoked");
    expect(grant.spent).toBe(1_000_000);
    expect(grant.remaining).toBe(grant.cap - grant.spent);
  });
});

describe("custodyStatement (RF-21: what is still in custody)", () => {
  it("is the credited balance minus milestone lines and liquidation payouts, with credits by category", () => {
    let m = fund({ ...unfundedMilestone(), projectId: "p1" }, at);
    m = review(submitEvidence(m, "Fotos", at), "approved", null, at);
    const [first] = m.lines;
    m = applyLineResult(m, first.id, { status: "completado", reference: "R" }, at);
    const project = sampleProject({ custodyBalance: 500_000_000 });
    const statement = custodyStatement(project, { INVESTOR_CAPITAL: 300_000_000, HARVEST_PAYMENT: 200_000_000 }, [m], []);
    expect(statement).toEqual({
      currency: "COP",
      assetScale: 2,
      credited: 500_000_000,
      credits: [
        { category: "INVESTOR_CAPITAL", amount: 300_000_000 },
        { category: "HARVEST_PAYMENT", amount: 200_000_000 },
      ],
      milestoneDebits: first.amount,
      settlementDebits: 0,
      balance: 500_000_000 - first.amount,
    });
    const afterLiquidation = custodyStatement(project, {}, [], [executed(null)]);
    expect(afterLiquidation.settlementDebits).toBe(200_000_000);
    expect(afterLiquidation.balance).toBe(300_000_000);
  });
});

describe("realizedReturns (RF-27 / A9: TIR realized from the executed payouts)", () => {
  it("is pending until a settlement is executed", () => {
    expect(realizedReturns([investment()], [sampleSettlement()])).toEqual({ status: "pending" });
  });

  it("computes TIR_COP from X_i / k_i over d, and the investor-currency TIR from what the wallet received against what it paid", () => {
    const settlement = executed(10_000);
    const x = settlement.payouts.find((p) => p.id === "investor-inv-eur")?.amount ?? 0;
    const realized = realizedReturns([investment()], [settlement]);
    expect(realized).toMatchObject({ status: "settled", settlementId: settlement.id, days: 365, capital: 40_000_000, returned: x, investorCurrency: "EUR", exitRateAssumed: false });
    // d = 365: TIR = multiple − 1.
    expect(realized.status === "settled" && realized.tirCopPct).toBeCloseTo(((x / 40_000_000) - 1) * 100, 2);
    expect(realized.status === "settled" && realized.tirInvestorCurrencyPct).toBeCloseTo((10_000 / 9_091 - 1) * 100, 2);
  });

  it("assumes TRM_d = TRM_0 when the payout receipt has no foreign amount (simulated mode)", () => {
    const realized = realizedReturns([investment()], [executed(null)]);
    expect(realized).toMatchObject({ status: "settled", exitRateAssumed: true });
    expect(realized.status === "settled" && realized.tirInvestorCurrencyPct).toBe(realized.status === "settled" && realized.tirCopPct);
  });

  it("is null-safe without captured capital", () => {
    expect(realizedReturns([], [executed(null)])).toEqual({ status: "pending" });
  });
});

describe("medianReturns (RF-27: the latest simulation's median TIR)", () => {
  const sheet = {
    monteCarlo: { tirPct: { p10: 1, median: 14.5, p90: 20 } },
    currencies: [{ currency: "EUR", entryRate: 4_400, exits: [{ exitRate: 4_000, tirPct: { median: 25 } }, { exitRate: 4_400, tirPct: { median: 14.5 } }, { exitRate: 4_800, tirPct: { median: 5 } }] }],
  };
  const run = { id: "run-1", createdAt: at, sheet } as never;

  it("reads the COP median and the investor currency's median at an exit rate equal to the entry rate", () => {
    expect(medianReturns(run, "EUR")).toEqual({ runId: "run-1", createdAt: at, tirCopPct: 14.5, investorCurrency: "EUR", entryRate: 4_400, exitRate: 4_400, tirInvestorCurrencyPct: 14.5 });
  });

  it("uses the COP median for a COP investor, null currency median when the run did not simulate it, and null without a run", () => {
    expect(medianReturns(run, "COP")).toMatchObject({ tirInvestorCurrencyPct: 14.5, investorCurrency: "COP" });
    expect(medianReturns(run, "USD")).toMatchObject({ tirInvestorCurrencyPct: null, exitRate: null });
    expect(medianReturns(null, "EUR")).toBeNull();
  });
});
