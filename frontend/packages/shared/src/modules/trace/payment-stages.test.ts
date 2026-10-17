import { groupPaymentSteps, toPaymentStepRows } from "./domain/payment-steps";
import { formatElapsed, fxRateText, paymentAmounts, shortResourceId, toPaymentReceipt, toPaymentStages } from "./domain/payment-stages";

const at = (second: number, ms = 0) => new Date(Date.UTC(2026, 9, 17, 10, 0, second, ms)).toISOString();

const timeline = (kind: string, steps: Array<[string, string, Record<string, unknown>?]>) =>
  groupPaymentSteps(
    toPaymentStepRows(
      steps.map(([step, when, detail]) => ({
        payment_kind: kind,
        payment_id: "pay-1",
        step,
        at: when,
        op_url: step === "outgoing_created" ? "https://wallet.example/alice/outgoing-payments/504ced7d-91aa" : null,
        detail: detail ?? null,
        project_id: "p1",
      })),
    ),
  )[0]!;

const summary = (stages: ReturnType<typeof toPaymentStages>) => stages.map((s) => [s.key, s.status, s.elapsedSeconds]);

describe("payment receipt stages (RF-20)", () => {
  it("maps a gateway payment onto the four canonical stages with the seconds between them", () => {
    const line = timeline("milestone_line", [
      ["incoming_created", at(0)],
      ["quote_created", at(3, 300)],
      ["outgoing_created", at(4, 500)],
      ["completed", at(8, 500)],
    ]);
    expect(summary(toPaymentStages(line))).toEqual([
      ["incoming", "done", null],
      ["quote", "done", 3.3],
      ["outgoing", "done", 1.2],
      ["confirmed", "done", 4],
    ]);
    const receipt = toPaymentReceipt(line);
    expect(receipt.state).toBe("confirmed");
    expect(receipt.proofUrl).toBe("https://wallet.example/alice/outgoing-payments/504ced7d-91aa");
  });

  it("puts the grant first for a deposit and leaves a bare request current, waiting for approval", () => {
    const deposit = timeline("buyer_deposit", [["grant_requested", at(0)]]);
    const stages = toPaymentStages(deposit);
    expect(summary(stages)).toEqual([
      ["authorization", "current", null],
      ["incoming", "pending", null],
      ["quote", "pending", null],
      ["outgoing", "pending", null],
      ["confirmed", "pending", null],
    ]);
    expect(stages[0]!.note).toBe("esperando aprobación");
    expect(toPaymentReceipt(deposit).state).toBe("in_progress");
  });

  it("places the investment grant between the quote and the outgoing payment", () => {
    const capture = timeline("investment_capture", [
      ["incoming_created", at(0)],
      ["quote_created", at(1)],
      ["grant_requested", at(2)],
      ["grant_approved", at(30)],
      ["outgoing_created", at(31)],
    ]);
    expect(summary(toPaymentStages(capture))).toEqual([
      ["incoming", "done", null],
      ["quote", "done", 1],
      ["authorization", "done", 29],
      ["outgoing", "done", 1],
      ["confirmed", "current", null],
    ]);
    expect(toPaymentReceipt(capture).state).toBe("sent");
  });

  it("marks the stage in play as failed and surfaces the recorded reason", () => {
    const capture = timeline("investment_capture", [
      ["incoming_created", at(0)],
      ["quote_created", at(1)],
      ["grant_approved", at(5)],
      ["failed", at(6), { reason: "Grant rechazado" }],
    ]);
    const stages = toPaymentStages(capture);
    expect(stages.map((s) => s.status)).toEqual(["done", "done", "done", "failed", "pending"]);
    expect(stages[3]!.elapsedSeconds).toBe(1);
    expect(toPaymentReceipt(capture)).toMatchObject({ state: "failed", error: "Grant rechazado" });
  });

  it("shows a sent-but-unconfirmed deposit as sent with a note, confirmation still in play", () => {
    const deposit = timeline("buyer_deposit", [
      ["grant_requested", at(0)],
      ["grant_approved", at(10)],
      ["incoming_created", at(11)],
      ["quote_created", at(12)],
      ["outgoing_created", at(13)],
      ["sent_unconfirmed", at(40)],
    ]);
    const stages = toPaymentStages(deposit);
    expect(stages.find((s) => s.key === "outgoing")).toMatchObject({ status: "done", note: "falta confirmarlo" });
    expect(stages.at(-1)!.status).toBe("current");
    expect(toPaymentReceipt(deposit).state).toBe("unconfirmed");
  });

  it("marks stages never recorded before a later one as skipped, and the elapsed time skips over them", () => {
    const deposit = timeline("buyer_deposit", [
      ["grant_approved", at(0)],
      ["completed", at(20)],
    ]);
    expect(summary(toPaymentStages(deposit))).toEqual([
      ["authorization", "done", null],
      ["incoming", "skipped", null],
      ["quote", "skipped", null],
      ["outgoing", "skipped", null],
      ["confirmed", "done", 20],
    ]);
  });

  it("formats elapsed time with an es-CO decimal comma and minutes past one minute", () => {
    expect(formatElapsed(3.3)).toBe("3,3 s");
    expect(formatElapsed(4)).toBe("4,0 s");
    expect(formatElapsed(125)).toBe("2 min 5 s");
    expect(formatElapsed(null)).toBeNull();
  });

  it("reads amounts and the FX rate from the step detail when present, and omits them otherwise", () => {
    const steps = timeline("milestone_line", [
      ["quote_created", at(0), { debitAmount: { value: "355263", assetCode: "COP", assetScale: 2 }, receiveAmount: { value: "100", assetCode: "EUR", assetScale: 2 } }],
    ]).steps;
    const amounts = paymentAmounts(steps);
    expect(amounts.receive).toEqual({ value: "100", assetCode: "EUR", assetScale: 2 });
    expect(fxRateText(amounts)).toBe("1 EUR = 3.552,63 COP");
    expect(fxRateText({ debit: null, receive: null, rate: "41/10" })).toBe("4,1");
    const none = paymentAmounts(timeline("milestone_line", [["incoming_created", at(0)]]).steps);
    expect(none).toEqual({ debit: null, receive: null, rate: null });
    expect(fxRateText(none)).toBeNull();
  });

  it("shortens the outgoing payment URL to the first 8 characters of its id", () => {
    expect(shortResourceId("https://wallet.example/alice/outgoing-payments/504ced7d-91aa")).toBe("504ced7d…");
    expect(shortResourceId("https://wallet.example/x/abc")).toBe("abc");
  });
});
