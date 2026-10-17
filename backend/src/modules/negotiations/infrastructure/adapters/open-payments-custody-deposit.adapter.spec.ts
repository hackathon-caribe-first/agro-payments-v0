import { createHash } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import { mockOpenPayments } from "../../../milestones/infrastructure/adapters/open-payments.testing";
import { depositDebitLimit, OpenPaymentsCustodyDeposit } from "./open-payments-custody-deposit.adapter";

const API = "http://api.test";
const BUYER_WALLET = { id: "https://ilp.test/buyer", authServer: "https://auth.buyer.test", resourceServer: "https://rs.buyer.test", assetCode: "COP", assetScale: 2 };
const CUSTODY_WALLET = { id: "https://ilp.test/custody", authServer: "https://auth.custody.test", resourceServer: "https://rs.custody.test", assetCode: "COP", assetScale: 2 };
const order = { negotiationId: "qr-1", projectId: "p1", amount: 450_000_000, currency: "COP", assetScale: 2 };

const gnapHash = (clientNonce: string, interactRef: string, grantEndpoint: string) =>
  createHash("sha256").update(`${clientNonce}\nas-nonce\n${interactRef}\n${grantEndpoint}`).digest("base64");

function setup(buyerWallet: string | null = BUYER_WALLET.id, wallets = [BUYER_WALLET, CUSTODY_WALLET]) {
  const mock = mockOpenPayments(wallets);
  mock.op.custodyWalletAddress = CUSTODY_WALLET.id;
  return { ...mock, deposit: new OpenPaymentsCustodyDeposit(mock.op, buyerWallet, API) };
}

async function started() {
  const ctx = setup();
  const result = await ctx.deposit.start(order);
  const nonce = (ctx.client.grant.request.mock.calls[0][1].interact as { finish: { nonce: string } }).finish.nonce;
  return { ...ctx, result, callback: { interactRef: "ref-1", hash: gnapHash(nonce, "ref-1", BUYER_WALLET.authServer) } };
}

describe("OpenPaymentsCustodyDeposit.start", () => {
  it("asks the BUYER's wallet for an interactive outgoing grant capped at the total plus fee headroom, finishing on the API callback", async () => {
    const { client, result, grants } = await started();
    expect(result).toEqual({ redirectUrl: "https://wallet.test/consent" });
    expect(depositDebitLimit(450_000_000)).toBe(454_500_000);
    expect(client.grant.request).toHaveBeenCalledWith(
      { url: BUYER_WALLET.authServer },
      {
        access_token: {
          access: [
            {
              type: "outgoing-payment",
              actions: ["create", "read", "list"],
              identifier: BUYER_WALLET.id,
              limits: { debitAmount: { value: "454500000", assetCode: "COP", assetScale: 2 } },
            },
          ],
        },
        interact: { start: ["redirect"], finish: { method: "redirect", uri: `${API}/api/negotiations/qr-1/deposit/callback`, nonce: expect.any(String) } },
      },
    );
    expect(await grants.findLatestForNegotiation("qr-1")).toMatchObject({
      purpose: "buyer_deposit",
      projectId: "p1",
      milestoneId: null,
      negotiationId: "qr-1",
      payerWalletAddress: BUYER_WALLET.id,
      debitLimit: 454_500_000,
      status: "pending",
    });
    expect(await grants.findLatestForMilestone("qr-1")).toBeNull();
  });

  it("refuses without OP_BUYER_WALLET_ADDRESS, or when a wallet does not hold the project's asset (no FX), before any grant", async () => {
    const unset = setup(null);
    await expect(unset.deposit.start(order)).rejects.toThrow(/OP_BUYER_WALLET_ADDRESS/);
    const usd = setup(BUYER_WALLET.id, [{ ...BUYER_WALLET, assetCode: "USD" }, CUSTODY_WALLET]);
    await expect(usd.deposit.start(order)).rejects.toThrow(DomainError);
    expect(usd.client.grant.request).not.toHaveBeenCalled();
  });
});

describe("OpenPaymentsCustodyDeposit.complete", () => {
  it("continues the verified grant, then pays buyer → custody: incoming payment for the exact total, quote, outgoing payment", async () => {
    const { deposit, client, grants, callback } = await started();
    const { reference } = await deposit.complete(order, callback);

    expect(client.incomingPayment.create).toHaveBeenCalledWith(
      { url: CUSTODY_WALLET.resourceServer, accessToken: "incoming-payment-token" },
      { walletAddress: CUSTODY_WALLET.id, incomingAmount: { value: "450000000", assetCode: "COP", assetScale: 2 } },
    );
    const incomingId = (await client.incomingPayment.create.mock.results[0].value).id;
    expect(client.quote.create).toHaveBeenCalledWith({ url: BUYER_WALLET.resourceServer, accessToken: "quote-token" }, { walletAddress: BUYER_WALLET.id, receiver: incomingId, method: "ilp" });
    expect(client.outgoingPayment.create).toHaveBeenCalledWith(
      { url: BUYER_WALLET.resourceServer, accessToken: "outgoing-token" },
      { walletAddress: BUYER_WALLET.id, quoteId: expect.stringContaining("/quotes/q-1") },
    );
    expect(reference).toMatch(/outgoing-payments\/out-1$/);
    expect(await grants.findLatestForNegotiation("qr-1")).toMatchObject({ status: "active", pending: null });
  });

  it("rejects a bad hash without continuing, and a replay once consumed", async () => {
    const { deposit, client, callback } = await started();
    await expect(deposit.complete(order, { ...callback, hash: "bm9wZQ==" })).rejects.toThrow(DomainError);
    expect(client.grant.continue).not.toHaveBeenCalled();
    await deposit.complete(order, callback);
    await expect(deposit.complete(order, callback)).rejects.toThrow(DomainError);
  });

  it("refuses a quote that would debit more than the buyer approved, before paying", async () => {
    const { deposit, client, callback } = await started();
    client.quote.create.mockResolvedValueOnce({ id: "q-big", debitAmount: { value: "454500001", assetCode: "COP", assetScale: 2 } } as never);
    await expect(deposit.complete(order, callback)).rejects.toThrow(DomainError);
    expect(client.outgoingPayment.create).not.toHaveBeenCalled();
  });
});
