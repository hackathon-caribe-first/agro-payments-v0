import { DomainError } from "../../../../shared/domain-errors";
import type { LinePaymentRequest } from "../../ports/payment-gateway";
import { OpenPaymentsGateway } from "./open-payments-payment-gateway.adapter";
import { activeGrant, amount, authError, CUSTODY, GRANT_ACCESS, mockOpenPayments, RECEIVER } from "./open-payments.testing";

const request: LinePaymentRequest = {
  milestoneId: "m1",
  lineId: "l-prov",
  walletAddress: RECEIVER.id,
  amount: 3_000,
  currency: "USD",
  assetScale: 2,
};
const INCOMING = `${RECEIVER.resourceServer}/incoming-payments/in-1`;
const OUTGOING = `${CUSTODY.resourceServer}/outgoing-payments/out-1`;
const QUOTE = `${CUSTODY.resourceServer}/quotes/q-1`;
const usd = (value: number) => ({ value, assetCode: "USD", assetScale: 2 });

const funded = async () => {
  const mock = mockOpenPayments();
  await mock.grants.save(activeGrant());
  return { ...mock, gateway: new OpenPaymentsGateway(mock.op) };
};

describe("OpenPaymentsGateway.pay", () => {
  it("creates the incoming payment, quotes it and pays it from the custody wallet with the milestone grant, all on the resource servers", async () => {
    const { gateway, calls, client } = await funded();

    const result = await gateway.pay(request);

    // v3 RF-17: the grant's spent total is read before anything is created or quoted (new call after the wallet GETs).
    // RF-18 (support branch): before that, the custody's outgoing payments are searched by the line's metadata key.
    expect(calls).toEqual([
      `wallet.get ${RECEIVER.id}`,
      `wallet.get ${CUSTODY.id}`,
      `outgoingPayment.list ${CUSTODY.resourceServer}`,
      `outgoingPayment.getGrantSpentAmounts ${CUSTODY.resourceServer}`,
      `grant.request ${RECEIVER.authServer} incoming-payment`,
      `incomingPayment.create ${RECEIVER.resourceServer}`,
      `grant.request ${CUSTODY.authServer} quote`,
      `quote.create ${CUSTODY.resourceServer}`,
      `outgoingPayment.create ${CUSTODY.resourceServer}`,
    ]);
    expect(client.incomingPayment.create).toHaveBeenCalledWith(
      { url: RECEIVER.resourceServer, accessToken: "incoming-payment-token" },
      { walletAddress: RECEIVER.id, incomingAmount: { value: "3000", assetCode: "USD", assetScale: 2 }, metadata: { line: "m1:l-prov" } },
    );
    expect(client.quote.create).toHaveBeenCalledWith(
      { url: CUSTODY.resourceServer, accessToken: "quote-token" },
      { walletAddress: CUSTODY.id, receiver: INCOMING, method: "ilp" },
    );
    expect(client.outgoingPayment.create).toHaveBeenCalledWith(
      { url: CUSTODY.resourceServer, accessToken: "outgoing-token" },
      { walletAddress: CUSTODY.id, quoteId: QUOTE, metadata: { line: "m1:l-prov" } },
    );
    expect(result.status).toBe("en_cola");
    expect(result.reference).toContain(INCOMING);
    expect(result.reference).toContain(OUTGOING);
  });

  it("pays from the payer wallet recorded on the grant", async () => {
    const OTHER = { ...CUSTODY, id: "https://ilp.test/other-custody", resourceServer: "https://rs.other.test" };
    const mock = mockOpenPayments([CUSTODY, OTHER, RECEIVER]);
    await mock.grants.save(activeGrant({ payerWalletAddress: OTHER.id }));
    await new OpenPaymentsGateway(mock.op).pay(request);
    expect(mock.client.outgoingPayment.create.mock.calls[0][0]).toEqual({ url: OTHER.resourceServer, accessToken: "outgoing-token" });
  });

  it("rotates the grant token once on 401 and retries the outgoing payment", async () => {
    const { gateway, client, grants } = await funded();
    client.outgoingPayment.create.mockRejectedValueOnce(authError(401));

    expect((await gateway.pay(request)).status).toBe("en_cola");

    expect(client.token.rotate).toHaveBeenCalledWith({ url: "https://auth.test/token/out", accessToken: "outgoing-token" });
    expect(client.outgoingPayment.create).toHaveBeenCalledTimes(2);
    expect(client.outgoingPayment.create.mock.calls[1][0]).toEqual({ url: CUSTODY.resourceServer, accessToken: "rotated-token" });
    expect((await grants.findLatestForMilestone("m1"))?.access).toEqual({
      ...GRANT_ACCESS,
      accessToken: "rotated-token",
      manageUrl: "https://auth.test/token/rotated",
    });
  });

  it("rotates only once: a second auth failure propagates", async () => {
    const { gateway, client } = await funded();
    client.outgoingPayment.create.mockRejectedValueOnce(authError(403)).mockRejectedValueOnce(authError(403));
    await expect(gateway.pay(request)).rejects.toThrow();
    expect(client.token.rotate).toHaveBeenCalledTimes(1);
  });

  it("does not rotate on errors that are not 401/403", async () => {
    const { gateway, client } = await funded();
    client.outgoingPayment.create.mockRejectedValueOnce(authError(500));
    await expect(gateway.pay(request)).rejects.toThrow();
    expect(client.token.rotate).not.toHaveBeenCalled();
  });

  it("is idempotent per milestone:line, a second pay returns the first reference without paying again", async () => {
    const { gateway, client } = await funded();
    const first = await gateway.pay(request);
    expect(await gateway.pay(request)).toEqual(first);
    expect(client.incomingPayment.create).toHaveBeenCalledTimes(1);
    expect(client.outgoingPayment.create).toHaveBeenCalledTimes(1);
  });

  it("fails the line without creating payments when the beneficiary wallet uses another asset", async () => {
    const { gateway, client } = await funded();
    expect(await gateway.pay({ ...request, currency: "COP" })).toEqual({ status: "fallido", reference: null });
    expect(client.incomingPayment.create).not.toHaveBeenCalled();
    expect(client.outgoingPayment.create).not.toHaveBeenCalled();
  });

  it("starts the RF-23 receipt with payment and quote ids, quoted amounts with their assets and the pre-payment grant total", async () => {
    const { gateway, client } = await funded();
    const created = await client.outgoingPayment.create.getMockImplementation()!({ url: CUSTODY.resourceServer, accessToken: "t" }, {});
    client.outgoingPayment.create.mockResolvedValueOnce({ ...created, grantSpentDebitAmount: amount("5000") });

    expect((await gateway.pay(request)).receipt).toEqual({
      incomingPaymentId: INCOMING,
      outgoingPaymentId: OUTGOING,
      quoteId: QUOTE,
      debitAmount: usd(3_010),
      receiveAmount: usd(3_000),
      grantSpentBefore: 5_000,
    });
  });

  it("leaves the pre-payment grant total unknown when the wallet does not report it", async () => {
    const { gateway } = await funded();
    expect((await gateway.pay(request)).receipt?.grantSpentBefore).toBeNull();
  });

  it("refuses a fixed-debit (cross-currency) payment with a DomainError before any network call: not supported yet", async () => {
    const { gateway, calls } = await funded();
    await expect(gateway.pay({ ...request, fixedDebitAmount: true })).rejects.toThrow(DomainError);
    expect(calls).toEqual([]);
  });

  it("refuses a revoked grant with a DomainError before any network call", async () => {
    const { op, grants, calls } = mockOpenPayments();
    await grants.save(activeGrant({ status: "revoked", revokedAt: new Date() }));
    await expect(new OpenPaymentsGateway(op).pay(request)).rejects.toThrow(DomainError);
    expect(calls).toEqual([]);
  });

  it("refuses to pay a milestone without an active grant", async () => {
    const { op, client, grants } = mockOpenPayments();
    await expect(new OpenPaymentsGateway(op).pay(request)).rejects.toThrow(/grant/);
    await grants.save(activeGrant({ status: "pending", access: null }));
    await expect(new OpenPaymentsGateway(op).pay(request)).rejects.toThrow(/grant/);
    expect(client.incomingPayment.create).not.toHaveBeenCalled();
  });
});

describe("OpenPaymentsGateway.check", () => {
  const paid = async () => {
    const setup = await funded();
    const { reference } = await setup.gateway.pay(request);
    return { ...setup, reference: reference! };
  };

  it("reports completado once the incoming payment is completed, with the settled receipt and the grant total re-read", async () => {
    const { gateway, client, reference } = await paid();
    client.incomingPayment.get.mockResolvedValueOnce({ id: INCOMING, completed: true, receivedAmount: amount("3000") });
    client.outgoingPayment.getGrantSpentAmounts.mockResolvedValueOnce({ spentDebitAmount: amount("3010"), spentReceiveAmount: amount("3000") });

    expect(await gateway.check(reference)).toEqual({
      status: "completado",
      reference,
      receipt: {
        incomingPaymentId: INCOMING,
        outgoingPaymentId: OUTGOING,
        quoteId: QUOTE,
        debitAmount: usd(3_010),
        receiveAmount: usd(3_000),
        grantSpentAfter: 3_010,
      },
    });
    expect(client.incomingPayment.get).toHaveBeenCalledWith({ url: INCOMING, accessToken: "incoming-payment-token" });
    expect(client.outgoingPayment.get).toHaveBeenCalledWith({ url: OUTGOING, accessToken: "outgoing-token" });
    expect(client.outgoingPayment.getGrantSpentAmounts).toHaveBeenCalledWith({ url: CUSTODY.resourceServer, accessToken: "outgoing-token" });
  });

  it("reads an unspent grant as zero, and an unreadable one as unknown, without failing the settlement", async () => {
    const first = await paid();
    first.client.incomingPayment.get.mockResolvedValueOnce({ id: INCOMING, completed: true, receivedAmount: amount("3000") });
    expect((await first.gateway.check(first.reference)).receipt?.grantSpentAfter).toBe(0);

    const second = await paid();
    second.client.incomingPayment.get.mockResolvedValueOnce({ id: INCOMING, completed: true, receivedAmount: amount("3000") });
    second.client.outgoingPayment.getGrantSpentAmounts.mockRejectedValueOnce(authError(500));
    const result = await second.gateway.check(second.reference);
    expect(result.status).toBe("completado");
    expect(result.receipt?.grantSpentAfter).toBeNull();
  });

  it("reports fallido when the outgoing payment failed", async () => {
    const { gateway, client, reference } = await paid();
    client.outgoingPayment.get.mockResolvedValueOnce({ id: OUTGOING, quoteId: QUOTE, failed: true, debitAmount: amount("3010"), receiveAmount: amount("3000") });

    expect(await gateway.check(reference)).toEqual({ status: "fallido", reference });
    expect(client.outgoingPayment.get).toHaveBeenCalledWith({ url: OUTGOING, accessToken: "outgoing-token" });
  });

  it("keeps the line en_cola while money is still moving", async () => {
    const { gateway, reference } = await paid();
    expect(await gateway.check(reference)).toEqual({ status: "en_cola", reference });
  });
});

describe("OpenPaymentsGateway grant cap (RF-17)", () => {
  it("refuses (409) a line the grant cannot cover anymore, before creating any payment", async () => {
    const { gateway, client, calls } = await funded();
    client.outgoingPayment.getGrantSpentAmounts.mockResolvedValueOnce({ spentDebitAmount: amount("8000"), spentReceiveAmount: amount("8000") });
    await expect(gateway.pay(request)).rejects.toThrow(DomainError);
    expect(calls.some((c) => c.startsWith("incomingPayment.create") || c.startsWith("quote.create"))).toBe(false);
  });

  it("still pays when the spent total cannot be read: the wallet enforces the limit anyway", async () => {
    const { gateway, client } = await funded();
    client.outgoingPayment.getGrantSpentAmounts.mockRejectedValueOnce(new Error("down"));
    expect((await gateway.pay(request)).status).toBe("en_cola");
  });
});

// PRD v3 Fase 3 paso 5 / RF-26: settlement payouts are paid from the liquidation grant the fiduciaria approved, keyed by the settlement.
describe("OpenPaymentsGateway liquidation scope", () => {
  const payout: LinePaymentRequest = { ...request, milestoneId: "s-1", lineId: "p-1", grantScope: "liquidation" };
  const liquidationGrant = activeGrant({ id: "g-liq", purpose: "liquidation", milestoneId: null, settlementId: "s-1" });

  it("pays a payout with the settlement's liquidation grant and settles it through the same grant", async () => {
    const mock = mockOpenPayments();
    await mock.grants.save(liquidationGrant);
    const gateway = new OpenPaymentsGateway(mock.op);

    const result = await gateway.pay(payout);
    expect(result.status).toBe("en_cola");
    expect(mock.client.outgoingPayment.create).toHaveBeenCalledWith({ url: CUSTODY.resourceServer, accessToken: "outgoing-token" }, expect.anything());

    mock.client.incomingPayment.get.mockResolvedValueOnce({ id: INCOMING, completed: true, receivedAmount: amount("3000") });
    expect((await gateway.check(result.reference as string)).status).toBe("completado");
  });

  it("never pays a payout from a milestone grant that happens to share the id", async () => {
    const mock = mockOpenPayments();
    await mock.grants.save(activeGrant({ milestoneId: "s-1" }));
    await expect(new OpenPaymentsGateway(mock.op).pay(payout)).rejects.toThrow(/Settlement s-1 has no outgoing-payment grant/);
    expect(mock.calls).toEqual([]);
  });
});

// PRD v3 Fase 1 paso 6 / RF-14: the net premium is paid from the premium grant the fiduciaria approved, keyed by the project.
describe("OpenPaymentsGateway premium scope", () => {
  const premium: LinePaymentRequest = { ...request, milestoneId: "p-1", lineId: "pay-1", grantScope: "premium" };

  it("pays the premium with the project's premium grant and settles it through the same grant", async () => {
    const mock = mockOpenPayments();
    await mock.grants.save(activeGrant({ id: "g-prem", purpose: "premium", milestoneId: null, projectId: "p-1" }));
    const gateway = new OpenPaymentsGateway(mock.op);

    const result = await gateway.pay(premium);
    expect(result.reference?.startsWith("premium:p-1 ")).toBe(true);
    mock.client.incomingPayment.get.mockResolvedValueOnce({ id: INCOMING, completed: true, receivedAmount: amount("3000") });
    expect((await gateway.check(result.reference as string)).status).toBe("completado");
  });

  it("never pays the premium from another purpose's grant on the same project", async () => {
    const mock = mockOpenPayments();
    await mock.grants.save(activeGrant({ projectId: "p-1", milestoneId: "p-1" }));
    await expect(new OpenPaymentsGateway(mock.op).pay(premium)).rejects.toThrow(/Premium of project p-1 has no outgoing-payment grant/);
    expect(mock.calls).toEqual([]);
  });
});

// RF-18: after a restart or a crash between create and save, the line has no stored reference; the payment that already left
// custody is found by its `milestone:line` metadata instead of being created twice.
describe("OpenPaymentsGateway idempotency by metadata (RF-18)", () => {
  const previous = (overrides: Partial<{ failed: boolean; metadata: Record<string, unknown> }> = {}) => ({
    id: `${CUSTODY.resourceServer}/outgoing-payments/out-0`,
    receiver: `${RECEIVER.resourceServer}/incoming-payments/in-0`,
    quoteId: `${CUSTODY.resourceServer}/quotes/q-0`,
    failed: false,
    debitAmount: amount("3010"),
    receiveAmount: amount("3000"),
    metadata: { line: "m1:l-prov" },
    ...overrides,
  });

  it("searches the custody wallet's outgoing payments with the grant token and the payer wallet address", async () => {
    const { gateway, client } = await funded();
    await gateway.pay(request);
    expect(client.outgoingPayment.list).toHaveBeenCalledWith({ url: CUSTODY.resourceServer, accessToken: "outgoing-token", walletAddress: CUSTODY.id }, { first: 100, "wallet-address": CUSTODY.id });
  });

  it("returns the payment a previous attempt made for the same milestone:line, without creating anything", async () => {
    const { gateway, client } = await funded();
    client.outgoingPayment.list.mockResolvedValueOnce({ pagination: { hasNextPage: false, hasPreviousPage: false }, result: [previous()] });

    const result = await gateway.pay(request);

    expect(result.status).toBe("en_cola");
    expect(result.reference).toBe(`m1 ${RECEIVER.resourceServer}/incoming-payments/in-0 ${CUSTODY.resourceServer}/outgoing-payments/out-0`);
    expect(result.receipt).toMatchObject({ outgoingPaymentId: `${CUSTODY.resourceServer}/outgoing-payments/out-0`, debitAmount: usd(3010) });
    expect(client.incomingPayment.create).not.toHaveBeenCalled();
    expect(client.outgoingPayment.create).not.toHaveBeenCalled();
    expect(client.outgoingPayment.getGrantSpentAmounts).not.toHaveBeenCalled();
  });

  it("ignores another line's payment and a failed one for this line", async () => {
    const { gateway, client } = await funded();
    client.outgoingPayment.list.mockResolvedValueOnce({
      pagination: { hasNextPage: false, hasPreviousPage: false },
      result: [previous({ metadata: { line: "m1:other" } }), previous({ failed: true })],
    });
    await gateway.pay(request);
    expect(client.outgoingPayment.create).toHaveBeenCalledTimes(1);
  });

  it("follows the pages until it finds the line", async () => {
    const { gateway, client } = await funded();
    client.outgoingPayment.list
      .mockResolvedValueOnce({ pagination: { hasNextPage: true, hasPreviousPage: false, endCursor: "c1" }, result: [previous({ metadata: { line: "m1:x" } })] })
      .mockResolvedValueOnce({ pagination: { hasNextPage: false, hasPreviousPage: true }, result: [previous()] });
    await gateway.pay(request);
    expect(client.outgoingPayment.list).toHaveBeenLastCalledWith(expect.anything(), { first: 100, "wallet-address": CUSTODY.id, cursor: "c1" });
    expect(client.outgoingPayment.create).not.toHaveBeenCalled();
  });

  it("falls back to creating the payment when the wallet cannot list (reference-based idempotency still holds)", async () => {
    const { gateway, client } = await funded();
    client.outgoingPayment.list.mockRejectedValueOnce(new Error("list not supported"));
    expect((await gateway.pay(request)).status).toBe("en_cola");
    expect(client.outgoingPayment.create).toHaveBeenCalledTimes(1);
  });

  it("keys liquidation payouts apart from milestone lines", async () => {
    const mock = mockOpenPayments();
    await mock.grants.save(activeGrant({ id: "g-liq", purpose: "liquidation", milestoneId: null, settlementId: "s-1" }));
    await new OpenPaymentsGateway(mock.op).pay({ ...request, milestoneId: "s-1", lineId: "p-1", grantScope: "liquidation" });
    expect(mock.client.outgoingPayment.create.mock.calls[0][1]).toMatchObject({ metadata: { line: "liquidation:s-1:p-1" } });
  });
});
