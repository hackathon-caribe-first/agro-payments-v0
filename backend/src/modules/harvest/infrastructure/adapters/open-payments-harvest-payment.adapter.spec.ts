import { createHash } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import { mockOpenPayments } from "../../../milestones/infrastructure/adapters/open-payments.testing";
import { OpenPaymentsHarvestPayment } from "./open-payments-harvest-payment.adapter";

const API = "http://api.test";
const BUYER_WALLET = { id: "https://ilp.test/buyer", authServer: "https://auth.buyer.test", resourceServer: "https://rs.buyer.test", assetCode: "COP", assetScale: 2 };
const CUSTODY_WALLET = { id: "https://ilp.test/custody", authServer: "https://auth.custody.test", resourceServer: "https://rs.custody.test", assetCode: "COP", assetScale: 2 };
const order = { projectId: "p1", amount: 11_400_000_000, currency: "COP", assetScale: 2 };

const gnapHash = (clientNonce: string, interactRef: string, grantEndpoint: string) =>
  createHash("sha256").update(`${clientNonce}\nas-nonce\n${interactRef}\n${grantEndpoint}`).digest("base64");

function setup(buyerWallet: string | null = BUYER_WALLET.id, wallets = [BUYER_WALLET, CUSTODY_WALLET]) {
  const mock = mockOpenPayments(wallets);
  mock.op.custodyWalletAddress = CUSTODY_WALLET.id;
  return { ...mock, payment: new OpenPaymentsHarvestPayment(mock.op, buyerWallet, API) };
}

async function started() {
  const ctx = setup();
  const result = await ctx.payment.start(order);
  const nonce = (ctx.client.grant.request.mock.calls[0][1].interact as { finish: { nonce: string } }).finish.nonce;
  return { ...ctx, result, callback: { interactRef: "ref-1", hash: gnapHash(nonce, "ref-1", BUYER_WALLET.authServer) } };
}

describe("OpenPaymentsHarvestPayment.start", () => {
  it("asks the buyer's wallet for an interactive grant for Q·P_g plus fee headroom, finishing on the harvest callback", async () => {
    const { client, result, grants } = await started();
    expect(result).toEqual({ redirectUrl: "https://wallet.test/consent" });
    expect(client.grant.request).toHaveBeenCalledWith(
      { url: BUYER_WALLET.authServer },
      expect.objectContaining({
        interact: { start: ["redirect"], finish: { method: "redirect", uri: `${API}/api/projects/p1/harvest/payment/callback`, nonce: expect.any(String) } },
      }),
    );
    expect(await grants.findLatestForHarvest("p1")).toMatchObject({
      purpose: "harvest_payment",
      projectId: "p1",
      milestoneId: null,
      payerWalletAddress: BUYER_WALLET.id,
      debitLimit: 11_514_000_000,
      status: "pending",
    });
  });

  it("refuses without OP_BUYER_WALLET_ADDRESS or when a wallet does not hold COP, before any grant", async () => {
    await expect(setup(null).payment.start(order)).rejects.toThrow(/OP_BUYER_WALLET_ADDRESS/);
    const usd = setup(BUYER_WALLET.id, [{ ...BUYER_WALLET, assetCode: "USD" }, CUSTODY_WALLET]);
    await expect(usd.payment.start(order)).rejects.toThrow(DomainError);
    expect(usd.client.grant.request).not.toHaveBeenCalled();
  });
});

describe("OpenPaymentsHarvestPayment.complete", () => {
  it("continues the verified grant, then pays buyer → custody: incoming payment for Q·P_g, quote, outgoing payment", async () => {
    const { payment, client, grants, callback } = await started();
    const { reference } = await payment.complete(order, callback);
    expect(client.incomingPayment.create).toHaveBeenCalledWith(
      { url: CUSTODY_WALLET.resourceServer, accessToken: "incoming-payment-token" },
      { walletAddress: CUSTODY_WALLET.id, incomingAmount: { value: "11400000000", assetCode: "COP", assetScale: 2 } },
    );
    expect(client.outgoingPayment.create).toHaveBeenCalledWith(
      { url: BUYER_WALLET.resourceServer, accessToken: "outgoing-token" },
      { walletAddress: BUYER_WALLET.id, quoteId: expect.stringContaining("/quotes/q-1") },
    );
    expect(reference).toMatch(/outgoing-payments\/out-1$/);
    expect(await grants.findLatestForHarvest("p1")).toMatchObject({ status: "active", pending: null });
  });

  it("rejects a bad hash without continuing, and a replay once consumed", async () => {
    const { payment, client, callback } = await started();
    await expect(payment.complete(order, { ...callback, hash: "bm9wZQ==" })).rejects.toThrow(DomainError);
    expect(client.grant.continue).not.toHaveBeenCalled();
    await payment.complete(order, callback);
    await expect(payment.complete(order, callback)).rejects.toThrow(DomainError);
  });
});
