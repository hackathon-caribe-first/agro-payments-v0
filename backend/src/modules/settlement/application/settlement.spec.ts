import { DomainError } from "../../../shared/domain-errors";
import { approveSettlement, applyPayoutResult, createSettlement, PAYOUT_STATUS, planPayouts, SETTLEMENT_STATUS, startExecution } from "./settlement";
import { sampleSettlement, sampleTerms, WALLETS } from "./testing";

const now = new Date("2026-10-17T12:00:00Z");

describe("planPayouts: one line per beneficiary in order of prelation (PRD v3 Fase 3 paso 5)", () => {
  it("pays the integrator, each investor, the producer and the platform their cascade totals", () => {
    const { payouts } = planPayouts(sampleTerms(), WALLETS, "COP");
    expect(payouts.map((p) => [p.id, p.beneficiary.kind, p.walletAddress, p.walletCurrency, p.amount, p.fixedDebitAmount])).toEqual([
      ["integrator", "integrator", "https://wallet.test/integrador", "COP", 10_000_000, false],
      ["investor-inv-cop", "investor", "https://wallet.test/inversionista-cop", "COP", 84_600_000, false],
      ["investor-inv-eur", "investor", "https://wallet.test/inversionista-eur", "EUR", 56_400_000, true],
      ["producer", "producer", WALLETS.producer, "COP", 37_400_000, false],
      ["platform", "platform", WALLETS.platform, "COP", 11_600_000, false],
    ]);
    expect(payouts.every((p) => p.status === PAYOUT_STATUS.PENDING && p.reference === null && p.receipt === null)).toBe(true);
  });

  it("skips zero payouts: a party the cascade gives nothing gets no line", () => {
    const { payouts } = planPayouts(sampleTerms({ proceeds: 50_000_000 }), WALLETS, "COP");
    expect(payouts.map((p) => p.id)).toEqual(["integrator", "investor-inv-cop", "investor-inv-eur"]);
  });

  it("needs the integrator's wallet when there is a debt", () => {
    expect(() => planPayouts(sampleTerms({ integratorWalletAddress: null }), WALLETS, "COP")).toThrow(DomainError);
  });
});

describe("settlement lifecycle: draft → approved → executing → executed | failed", () => {
  it("starts as a draft with the plan snapshot", () => {
    const s = createSettlement({ id: "s1", projectId: "p1", terms: sampleTerms(), wallets: WALLETS, currency: "COP", assetScale: 2, createdBy: "u-admin", now });
    expect(s.status).toBe(SETTLEMENT_STATUS.DRAFT);
    expect(s.plan.tiers).toHaveLength(5);
    expect(s.payouts).toHaveLength(5);
  });

  it("refuses to create a settlement with nothing to pay", () => {
    expect(() => sampleSettlement({ proceeds: 0 })).toThrow(DomainError);
  });

  it("approves only a draft, recording who and when", () => {
    const approved = approveSettlement(sampleSettlement(), "u-fidu", now);
    expect(approved).toMatchObject({ status: SETTLEMENT_STATUS.APPROVED, approvedBy: "u-fidu", approvedAt: now });
    expect(() => approveSettlement(approved, "u-fidu", now)).toThrow(DomainError);
  });

  it("executes only after approval; executing again is allowed (it syncs what is in flight)", () => {
    expect(() => startExecution(sampleSettlement())).toThrow(DomainError);
    const executing = startExecution(approveSettlement(sampleSettlement(), "u-fidu", now));
    expect(executing.status).toBe(SETTLEMENT_STATUS.EXECUTING);
    expect(startExecution(executing).status).toBe(SETTLEMENT_STATUS.EXECUTING);
  });

  const executing = () => startExecution(approveSettlement(sampleSettlement(), "u-fidu", now));

  it("maps gateway answers onto the payout and merges the RF-23 receipt", () => {
    let s = applyPayoutResult(executing(), "producer", { status: "en_cola", reference: "SIM-1", receipt: { debitAmount: { value: 37_400_000, assetCode: "COP", assetScale: 2 } } }, now);
    s = applyPayoutResult(s, "producer", { status: "completado", reference: "SIM-1", receipt: { receiveAmount: { value: 37_300_000, assetCode: "COP", assetScale: 2 } } }, now);
    const payout = s.payouts.find((p) => p.id === "producer");
    expect(payout).toMatchObject({ status: PAYOUT_STATUS.EXECUTED, reference: "SIM-1", settledAt: now });
    expect(payout?.receipt).toMatchObject({ debitAmount: { value: 37_400_000 }, receiveAmount: { value: 37_300_000 }, fee: 100_000, rate: "373/374" });
    expect(s.status).toBe(SETTLEMENT_STATUS.EXECUTING);
  });

  it("is executed once every payout is executed", () => {
    let s = executing();
    for (const p of s.payouts) s = applyPayoutResult(s, p.id, { status: "completado", reference: `R-${p.id}` }, now);
    expect(s).toMatchObject({ status: SETTLEMENT_STATUS.EXECUTED, executedAt: now });
  });

  it("is failed once every payout is final and one of them failed", () => {
    let s = executing();
    for (const p of s.payouts) s = applyPayoutResult(s, p.id, p.id === "platform" ? { status: "fallido", reference: null } : { status: "completado", reference: "R" }, now);
    expect(s.status).toBe(SETTLEMENT_STATUS.FAILED);
    expect(s.executedAt).toBeNull();
  });

  it("refuses answers for unknown or already final payouts", () => {
    const s = applyPayoutResult(executing(), "producer", { status: "completado", reference: "R" }, now);
    expect(() => applyPayoutResult(s, "producer", { status: "fallido", reference: null }, now)).toThrow(DomainError);
    expect(() => applyPayoutResult(s, "nobody", { status: "completado", reference: "R" }, now)).toThrow(DomainError);
  });
});
