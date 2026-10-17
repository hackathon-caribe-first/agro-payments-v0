import type { LinePaymentRequest } from "../../ports/payment-gateway";
import { OpenPaymentsGateway } from "./open-payments-payment-gateway.adapter";
import { authError, INVESTOR, mockOpenPayments, RECEIVER } from "./open-payments.testing";

const request: LinePaymentRequest = {
  milestoneId: "m1",
  lineId: "l-prov",
  walletAddress: RECEIVER.id,
  amount: 3_000,
  currency: "USD",
  assetScale: 2,
};
const INCOMING = `${RECEIVER.resourceServer}/incoming-payments/in-1`;
const OUTGOING = `${INVESTOR.resourceServer}/outgoing-payments/out-1`;

const funded = () => {
  const mock = mockOpenPayments();
  mock.grants.outgoing.set("m1", { accessToken: "outgoing-token", manageUrl: "https://auth.test/token/out" });
  return { ...mock, gateway: new OpenPaymentsGateway(mock.op) };
};

describe("OpenPaymentsGateway.pay", () => {
  it("creates the incoming payment, quotes it and pays it with the milestone grant, all on the resource servers", async () => {
    const { gateway, calls, client } = funded();

    const result = await gateway.pay(request);

    expect(calls).toEqual([
      `wallet.get ${RECEIVER.id}`,
      `wallet.get ${INVESTOR.id}`,
      `grant.request ${RECEIVER.authServer} incoming-payment`,
      `incomingPayment.create ${RECEIVER.resourceServer}`,
      `grant.request ${INVESTOR.authServer} quote`,
      `quote.create ${INVESTOR.resourceServer}`,
      `outgoingPayment.create ${INVESTOR.resourceServer}`,
    ]);
    expect(client.incomingPayment.create).toHaveBeenCalledWith(
      { url: RECEIVER.resourceServer, accessToken: "incoming-payment-token" },
      { walletAddress: RECEIVER.id, incomingAmount: { value: "3000", assetCode: "USD", assetScale: 2 } },
    );
    expect(client.quote.create).toHaveBeenCalledWith(
      { url: INVESTOR.resourceServer, accessToken: "quote-token" },
      { walletAddress: INVESTOR.id, receiver: INCOMING, method: "ilp" },
    );
    expect(client.outgoingPayment.create).toHaveBeenCalledWith(
      { url: INVESTOR.resourceServer, accessToken: "outgoing-token" },
      { walletAddress: INVESTOR.id, quoteId: `${INVESTOR.resourceServer}/quotes/q-1` },
    );
    expect(result.status).toBe("en_cola");
    expect(result.reference).toContain(INCOMING);
    expect(result.reference).toContain(OUTGOING);
  });

  it("rotates the grant token once on 401 and retries the outgoing payment", async () => {
    const { gateway, client, grants } = funded();
    client.outgoingPayment.create.mockRejectedValueOnce(authError(401));

    expect((await gateway.pay(request)).status).toBe("en_cola");

    expect(client.token.rotate).toHaveBeenCalledWith({ url: "https://auth.test/token/out", accessToken: "outgoing-token" });
    expect(client.outgoingPayment.create).toHaveBeenCalledTimes(2);
    expect(client.outgoingPayment.create.mock.calls[1][0]).toEqual({ url: INVESTOR.resourceServer, accessToken: "rotated-token" });
    expect(grants.outgoing.get("m1")).toEqual({ accessToken: "rotated-token", manageUrl: "https://auth.test/token/rotated" });
  });

  it("rotates only once: a second auth failure propagates", async () => {
    const { gateway, client } = funded();
    client.outgoingPayment.create.mockRejectedValueOnce(authError(403)).mockRejectedValueOnce(authError(403));
    await expect(gateway.pay(request)).rejects.toThrow();
    expect(client.token.rotate).toHaveBeenCalledTimes(1);
  });

  it("does not rotate on errors that are not 401/403", async () => {
    const { gateway, client } = funded();
    client.outgoingPayment.create.mockRejectedValueOnce(authError(500));
    await expect(gateway.pay(request)).rejects.toThrow();
    expect(client.token.rotate).not.toHaveBeenCalled();
  });

  it("is idempotent per milestone:line, a second pay returns the first reference without paying again", async () => {
    const { gateway, client } = funded();
    const first = await gateway.pay(request);
    expect(await gateway.pay(request)).toEqual(first);
    expect(client.incomingPayment.create).toHaveBeenCalledTimes(1);
    expect(client.outgoingPayment.create).toHaveBeenCalledTimes(1);
  });

  it("fails the line without creating payments when the beneficiary wallet uses another asset", async () => {
    const { gateway, client } = funded();
    expect(await gateway.pay({ ...request, currency: "COP" })).toEqual({ status: "fallido", reference: null });
    expect(client.incomingPayment.create).not.toHaveBeenCalled();
    expect(client.outgoingPayment.create).not.toHaveBeenCalled();
  });

  it("refuses to pay a milestone without a stored grant", async () => {
    const { op, client } = mockOpenPayments();
    await expect(new OpenPaymentsGateway(op).pay(request)).rejects.toThrow(/grant/);
    expect(client.incomingPayment.create).not.toHaveBeenCalled();
  });
});

describe("OpenPaymentsGateway.check", () => {
  const paid = async () => {
    const setup = funded();
    const { reference } = await setup.gateway.pay(request);
    return { ...setup, reference: reference! };
  };

  it("reports completado once the incoming payment is completed", async () => {
    const { gateway, client, reference } = await paid();
    client.incomingPayment.get.mockResolvedValueOnce({ id: INCOMING, completed: true });

    expect(await gateway.check(reference)).toEqual({ status: "completado", reference });
    expect(client.incomingPayment.get).toHaveBeenCalledWith({ url: INCOMING, accessToken: "incoming-payment-token" });
  });

  it("reports fallido when the outgoing payment failed", async () => {
    const { gateway, client, reference } = await paid();
    client.outgoingPayment.get.mockResolvedValueOnce({ id: OUTGOING, failed: true });

    expect(await gateway.check(reference)).toEqual({ status: "fallido", reference });
    expect(client.outgoingPayment.get).toHaveBeenCalledWith({ url: OUTGOING, accessToken: "outgoing-token" });
  });

  it("keeps the line en_cola while money is still moving", async () => {
    const { gateway, reference } = await paid();
    expect(await gateway.check(reference)).toEqual({ status: "en_cola", reference });
  });
});
