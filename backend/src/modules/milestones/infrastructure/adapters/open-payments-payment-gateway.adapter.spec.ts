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

    expect(calls).toEqual([
      `wallet.get ${RECEIVER.id}`,
      `wallet.get ${CUSTODY.id}`,
      `grant.request ${RECEIVER.authServer} incoming-payment`,
      `incomingPayment.create ${RECEIVER.resourceServer}`,
      `grant.request ${CUSTODY.authServer} quote`,
      `quote.create ${CUSTODY.resourceServer}`,
      `outgoingPayment.create ${CUSTODY.resourceServer}`,
    ]);
    expect(client.incomingPayment.create).toHaveBeenCalledWith(
      { url: RECEIVER.resourceServer, accessToken: "incoming-payment-token" },
      { walletAddress: RECEIVER.id, incomingAmount: { value: "3000", assetCode: "USD", assetScale: 2 } },
    );
    expect(client.quote.create).toHaveBeenCalledWith(
      { url: CUSTODY.resourceServer, accessToken: "quote-token" },
      { walletAddress: CUSTODY.id, receiver: INCOMING, method: "ilp" },
    );
    expect(client.outgoingPayment.create).toHaveBeenCalledWith(
      { url: CUSTODY.resourceServer, accessToken: "outgoing-token" },
      { walletAddress: CUSTODY.id, quoteId: QUOTE },
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
