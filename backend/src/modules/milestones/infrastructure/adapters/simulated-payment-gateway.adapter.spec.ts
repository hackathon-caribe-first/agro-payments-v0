import { SimulatedPaymentGateway } from "./simulated-payment-gateway.adapter";

const request = {
  milestoneId: "m1",
  lineId: "l1",
  walletAddress: "https://wallet.test/prov",
  amount: 300_000,
  currency: "COP",
  assetScale: 2,
};

describe("SimulatedPaymentGateway", () => {
  const gateway = new SimulatedPaymentGateway();

  it("queues a payment with a SIM reference", async () => {
    const result = await gateway.pay(request);
    expect(result.status).toBe("en_cola");
    expect(result.reference).toMatch(/^SIM-[A-Z0-9]{8}$/);
  });

  it("issues a different reference per payment", async () => {
    const [a, b] = await Promise.all([gateway.pay(request), gateway.pay(request)]);
    expect(a.reference).not.toBe(b.reference);
  });

  it("fails deterministically when the wallet address contains 'fail'", async () => {
    expect(await gateway.pay({ ...request, walletAddress: "https://wallet.test/fail-me" })).toEqual({
      status: "fallido",
      reference: null,
    });
  });

  it("resolves any queued reference as completado", async () => {
    expect(await gateway.check("SIM-ABCDEF12")).toEqual({ status: "completado", reference: "SIM-ABCDEF12" });
  });

  // RF-23: simulated payments carry a full synthetic receipt (debit = receive, SIM- ids), fixed debit or not.
  it("reports a synthetic receipt: debit = receive in the line asset, SIM- ids, unknown grant totals", async () => {
    for (const fixedDebitAmount of [true, undefined]) {
      const result = await gateway.pay({ ...request, walletAddress: "https://wallet.test/inversionista-eur", fixedDebitAmount });
      const id = result.reference!.slice("SIM-".length);
      expect(result.status).toBe("en_cola");
      expect(result.receipt).toEqual({
        incomingPaymentId: `SIM-IN-${id}`,
        outgoingPaymentId: `SIM-OUT-${id}`,
        quoteId: `SIM-QUOTE-${id}`,
        debitAmount: { value: 300_000, assetCode: "COP", assetScale: 2 },
        receiveAmount: { value: 300_000, assetCode: "COP", assetScale: 2 },
        grantSpentBefore: null,
        grantSpentAfter: null,
      });
    }
  });
});
