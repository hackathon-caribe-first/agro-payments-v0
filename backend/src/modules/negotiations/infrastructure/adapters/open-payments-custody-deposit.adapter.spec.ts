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
  // Custody has received the payment by default; specs override it to model a payment that never lands.
  mock.client.incomingPayment.get.mockImplementation((async ({ url }: { url: string }) => ({ id: url, completed: true, receivedAmount: { value: String(order.amount), assetCode: "COP", assetScale: 2 } })) as never);
  // The buyer's wallet quotes the exact total by default (same currency); specs override it to model FX.
  mock.client.quote.create.mockImplementation((async () => ({ id: "https://rs.custody.test/quotes/q-1", debitAmount: { value: String(order.amount), assetCode: "COP", assetScale: 2 } })) as never);
  return { ...mock, deposit: new OpenPaymentsCustodyDeposit(mock.op, buyerWallet, API) };
}

async function started() {
  const ctx = setup();
  const result = await ctx.deposit.start(order);
  // start() takes non-interactive tokens (incoming payment, quote) before the interactive grant, so find that one.
  const interactive = ctx.client.grant.request.mock.calls.find((call) => (call[1] as { interact?: unknown }).interact)!;
  const nonce = (interactive[1].interact as { finish: { nonce: string } }).finish.nonce;
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

  it("refuses without any buyer wallet, or when the custody wallet does not hold the project's asset, before any grant", async () => {
    const unset = setup(null);
    await expect(unset.deposit.start(order)).rejects.toThrow(/OP_BUYER_WALLET_ADDRESS/);
    const usd = setup(BUYER_WALLET.id, [BUYER_WALLET, { ...CUSTODY_WALLET, assetCode: "USD" }]);
    await expect(usd.deposit.start(order)).rejects.toThrow(DomainError);
    expect(usd.client.grant.request).not.toHaveBeenCalled();
  });

  it("prefers the wallet on the order (the purchase contract's) over the deployment one", async () => {
    const { deposit, client } = setup(null);
    await deposit.start({ ...order, buyerWalletAddress: BUYER_WALLET.id });
    expect(client.grant.request).toHaveBeenCalledWith({ url: BUYER_WALLET.authServer }, expect.anything());
  });

  it("caps the grant at the quoted debit in the buyer's own currency when it differs from the project's", async () => {
    const eur = { ...BUYER_WALLET, assetCode: "EUR" };
    const { deposit, client, grants } = setup(BUYER_WALLET.id, [eur, CUSTODY_WALLET]);
    client.quote.create.mockImplementation((async () => ({ id: "https://rs.custody.test/quotes/q-1", debitAmount: { value: "100000", assetCode: "EUR", assetScale: 2 } })) as never);
    await deposit.start(order);
    expect(await grants.findLatestForNegotiation("qr-1")).toMatchObject({ assetCode: "EUR", debitLimit: depositDebitLimit(100_000) });
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
