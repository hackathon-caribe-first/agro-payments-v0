import { createHash } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import { CUSTODY, mockOpenPayments } from "../../../milestones/infrastructure/adapters/open-payments.testing";
import { GRANT_PURPOSE, GRANT_STATUS } from "../../../milestones/ports/grant-store";
import { INVESTMENT_STATUS, type Investment } from "../../domain/investment";
import { OpenPaymentsInvestmentCapture } from "./open-payments-investment-capture.adapter";

const COP_CUSTODY = { ...CUSTODY, assetCode: "COP" };
const INVESTOR_WALLET = { id: "https://ilp.test/inversionista_eur", authServer: "https://auth.inv.test", resourceServer: "https://rs.inv.test", assetCode: "EUR", assetScale: 2 };
const NOW = new Date("2026-10-17T12:00:00.000Z");

const eur = (value: string) => ({ value, assetCode: "EUR", assetScale: 2 });
const cop = (value: string) => ({ value, assetCode: "COP", assetScale: 2 });
const opQuote = (id: string, debit: string, expiresAt = "2026-10-17T12:05:00.000Z") => ({
  id,
  walletAddress: INVESTOR_WALLET.id,
  receiver: "in",
  debitAmount: eur(debit),
  receiveAmount: cop("10000000"),
  method: "ilp" as const,
  createdAt: NOW.toISOString(),
  expiresAt,
});

const investment = (overrides: Partial<Investment> = {}): Investment => ({
  id: "inv-1",
  projectId: "p1",
  investorUserId: "u-inv",
  walletAddress: INVESTOR_WALLET.id,
  status: INVESTMENT_STATUS.PENDING_CONSENT,
  failureReason: null,
  amount: 10_000_000,
  currency: "COP",
  assetScale: 2,
  quote: null,
  impliedRate: null,
  incomingPaymentId: null,
  outgoingPaymentId: null,
  createdAt: NOW,
  capturedAt: null,
  ...overrides,
});

function setup(custody = COP_CUSTODY) {
  const mock = mockOpenPayments([custody, INVESTOR_WALLET]);
  let now = NOW;
  const capture = new OpenPaymentsInvestmentCapture(mock.op, "https://api.test", { now: () => now });
  return { ...mock, capture, at: (iso: string) => (now = new Date(iso)) };
}

// The finish hash the wallet would send for the mock's pending grant (nonce from the stored grant, "as-nonce" from the mock).
const hashFor = (clientNonce: string, interactRef: string) =>
  createHash("sha256").update(`${clientNonce}\nas-nonce\n${interactRef}\n${INVESTOR_WALLET.authServer}`).digest("base64");

async function started() {
  const s = setup();
  s.client.quote.create.mockResolvedValueOnce(opQuote("https://rs.inv.test/quotes/q-1", "2250"));
  const start = await s.capture.start(investment(), { id: INVESTOR_WALLET.id, assetCode: "EUR", assetScale: 2 });
  if (start.kind !== "consent") throw new Error("expected consent");
  const pending = investment({ quote: start.quote, incomingPaymentId: start.incomingPaymentId });
  const grant = await s.grants.findLatestForInvestment("inv-1");
  s.calls.length = 0;
  return { ...s, start, pending, callback: { interactRef: "ref-1", hash: hashFor(grant!.pending!.clientNonce, "ref-1") } };
}

describe("OpenPaymentsInvestmentCapture.wallet", () => {
  it("reads the asset of the wallet address", async () => {
    expect(await setup().capture.wallet(INVESTOR_WALLET.id)).toEqual({ id: INVESTOR_WALLET.id, assetCode: "EUR", assetScale: 2 });
  });
});

describe("OpenPaymentsInvestmentCapture.start", () => {
  it("incoming payment on custody for the exact COP amount, quote on the investor's wallet for it, then an interactive grant capped at the quoted debit", async () => {
    const { start, pending, grants, client } = await started();
    expect(client.incomingPayment.create).toHaveBeenCalledWith(
      { url: COP_CUSTODY.resourceServer, accessToken: "incoming-payment-token" },
      { walletAddress: COP_CUSTODY.id, incomingAmount: cop("10000000"), metadata: { project: "p1", investment: "inv-1" } },
    );
    expect(client.quote.create).toHaveBeenCalledWith(
      { url: INVESTOR_WALLET.resourceServer, accessToken: "quote-token" },
      { walletAddress: INVESTOR_WALLET.id, receiver: start.incomingPaymentId, receiveAmount: cop("10000000"), method: "ilp" },
    );
    const [, request] = client.grant.request.mock.calls.at(-1)!;
    expect(request).toMatchObject({
      access_token: { access: [{ type: "outgoing-payment", identifier: INVESTOR_WALLET.id, limits: { debitAmount: eur("2250") } }] },
      interact: { finish: { uri: "https://api.test/api/investments/inv-1/callback" } },
    });
    expect(start).toEqual({
      kind: "consent",
      redirectUrl: "https://wallet.test/consent",
      incomingPaymentId: expect.stringContaining("/incoming-payments/"),
      quote: { id: "https://rs.inv.test/quotes/q-1", debitAmount: 2_250, debitAssetCode: "EUR", debitAssetScale: 2, receiveAmount: 10_000_000, expiresAt: "2026-10-17T12:05:00.000Z" },
    });
    expect(pending.quote?.debitAmount).toBe(2_250);
    expect(await grants.findLatestForInvestment("inv-1")).toMatchObject({
      purpose: GRANT_PURPOSE.INVESTOR_CAPTURE,
      projectId: "p1",
      investmentId: "inv-1",
      payerWalletAddress: INVESTOR_WALLET.id,
      assetCode: "EUR",
      debitLimit: 2_250,
      status: GRANT_STATUS.PENDING,
    });
  });

  it("refuses a custody wallet that is not in the project currency, before anything is created", async () => {
    const { capture, client } = setup(CUSTODY);
    await expect(capture.start(investment(), { id: INVESTOR_WALLET.id, assetCode: "EUR", assetScale: 2 })).rejects.toThrow(DomainError);
    expect(client.incomingPayment.create).not.toHaveBeenCalled();
  });
});

describe("OpenPaymentsInvestmentCapture.complete", () => {
  it("a live quote: verifies the hash, continues the grant and pays with that quote", async () => {
    const { capture, pending, callback, client, calls } = await started();
    const done = await capture.complete(pending, callback);
    expect(done).toEqual({ kind: "captured", quote: pending.quote, outgoingPaymentId: expect.stringContaining("/outgoing-payments/") });
    expect(client.outgoingPayment.create).toHaveBeenCalledWith(
      { url: INVESTOR_WALLET.resourceServer, accessToken: "outgoing-token" },
      { walletAddress: INVESTOR_WALLET.id, quoteId: "https://rs.inv.test/quotes/q-1" },
    );
    expect(calls.filter((c) => c.startsWith("quote.create"))).toEqual([]);
  });

  it("an expired quote is never executed (RNF-13): it re-quotes and pays with the new one when it fits the approved limit", async () => {
    const { capture, pending, callback, client, at } = await started();
    at("2026-10-17T12:06:00.000Z");
    client.quote.create.mockResolvedValueOnce(opQuote("https://rs.inv.test/quotes/q-2", "2240", "2026-10-17T12:11:00.000Z"));
    const done = await capture.complete(pending, callback);
    expect(done).toMatchObject({ kind: "captured", quote: { id: "https://rs.inv.test/quotes/q-2", debitAmount: 2_240 } });
    expect(client.outgoingPayment.create).toHaveBeenCalledWith(expect.anything(), { walletAddress: INVESTOR_WALLET.id, quoteId: "https://rs.inv.test/quotes/q-2" });
  });

  it("refuses a re-quote whose debit exceeds the approved limit, records it and pays nothing", async () => {
    const { capture, pending, callback, client, at } = await started();
    at("2026-10-17T12:06:00.000Z");
    client.quote.create.mockResolvedValueOnce(opQuote("https://rs.inv.test/quotes/q-2", "2251"));
    const done = await capture.complete(pending, callback);
    expect(done).toMatchObject({ kind: "failed", quote: { id: "https://rs.inv.test/quotes/q-2", debitAmount: 2_251 }, reason: expect.stringMatching(/supera/) });
    expect(client.outgoingPayment.create).not.toHaveBeenCalled();
  });

  it("a payment error after consent is a failed outcome, not a throw: the consent cannot be replayed", async () => {
    const { capture, pending, callback, client } = await started();
    client.outgoingPayment.create.mockRejectedValueOnce(new Error("insufficient funds"));
    expect(await capture.complete(pending, callback)).toEqual({ kind: "failed", quote: pending.quote, reason: "insufficient funds" });
  });

  it("a forged callback throws and leaves the grant pending for the real one", async () => {
    const { capture, pending, grants, client } = await started();
    await expect(capture.complete(pending, { interactRef: "ref-1", hash: "Zm9yZ2Vk" })).rejects.toThrow(DomainError);
    expect(client.grant.continue).not.toHaveBeenCalled();
    expect((await grants.findLatestForInvestment("inv-1"))?.status).toBe(GRANT_STATUS.PENDING);
  });
});
