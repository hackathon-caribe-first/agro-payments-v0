import { PAYMENT_KIND, quoteDetail, recordGatewayResult, stepRecorder } from "./payment-step";
import { InMemoryPaymentSteps } from "./testing";

const line = { kind: PAYMENT_KIND.MILESTONE_LINE, paymentId: "p-1-ms-1:l-1", projectId: "p-1" };

describe("payment steps", () => {
  it("writes a step once: the same step twice keeps the first row", async () => {
    const steps = new InMemoryPaymentSteps();
    const record = stepRecorder(steps, line);
    await record("completed", "https://rs.test/outgoing-payments/o-1");
    await record("completed", "https://rs.test/outgoing-payments/o-2");
    expect(steps.rows).toEqual([expect.objectContaining({ step: "completed", opUrl: "https://rs.test/outgoing-payments/o-1" })]);
  });

  it("records what an Open Payments gateway result proves, then its terminal step, across pay() and check()", async () => {
    const steps = new InMemoryPaymentSteps();
    const receipt = { incomingPaymentId: "https://rs.test/incoming-payments/i-1", quoteId: "https://rs.test/quotes/q-1", outgoingPaymentId: "https://rs.test/outgoing-payments/o-1" };
    await recordGatewayResult(steps, line, { status: "en_cola", receipt });
    await recordGatewayResult(steps, line, { status: "en_cola" });
    await recordGatewayResult(steps, line, { status: "completado", receipt });
    expect(steps.of(line.kind, line.paymentId)).toEqual(["incoming_created", "quote_created", "outgoing_created", "completed"]);
    expect(steps.rows.at(-1)).toMatchObject({ opUrl: receipt.outgoingPaymentId, projectId: "p-1" });
  });

  it("records the simulated gateway's same logical steps without an op_url, and a failure", async () => {
    const steps = new InMemoryPaymentSteps();
    await recordGatewayResult(steps, line, { status: "en_cola", receipt: { incomingPaymentId: "SIM-IN-1", quoteId: "SIM-QUOTE-1", outgoingPaymentId: "SIM-OUT-1" } });
    await recordGatewayResult(steps, line, { status: "completado" });
    expect(steps.rows.map((r) => [r.step, r.opUrl])).toEqual([
      ["incoming_created", null],
      ["quote_created", null],
      ["outgoing_created", null],
      ["completed", null],
    ]);
    const failed = new InMemoryPaymentSteps();
    await recordGatewayResult(failed, line, { status: "fallido" });
    expect(failed.of(line.kind, line.paymentId)).toEqual(["failed"]);
  });

  it("keeps the quote's debit and receive amounts on quote_created, and no detail when the receipt has none", async () => {
    const steps = new InMemoryPaymentSteps();
    const debitAmount = { value: 101, assetCode: "USD", assetScale: 2 };
    const receiveAmount = { value: 400000, assetCode: "COP", assetScale: 2 };
    await recordGatewayResult(steps, line, { status: "en_cola", receipt: { quoteId: "https://rs.test/quotes/q-1", debitAmount, receiveAmount } });
    expect(steps.rows).toEqual([expect.objectContaining({ step: "quote_created", detail: { debitAmount, receiveAmount } })]);
    expect(quoteDetail(null, null)).toBeNull();
  });
});
