import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ValidationError } from "../../../shared/domain-errors";
import { InvestmentUseCases } from "../application/investments.use-cases";
import { EUR_WALLET, FakeCapture, InMemoryInvestmentStore, INVESTOR, NOW, sampleProject } from "../application/testing";
import { InvestmentCallbackController } from "./investment-callback.controller";
import { toCaptureResponse, toInvestmentResponse } from "./investments.mappers";
import { parseInvestRequest } from "./investments.requests";

const errorsOf = (input: unknown) => {
  try {
    parseInvestRequest(input);
  } catch (error) {
    if (error instanceof ValidationError) return error.fieldErrors;
    throw error;
  }
  throw new Error("expected a ValidationError");
};

describe("parseInvestRequest", () => {
  it("turns whole pesos into minor units (COP, scale 2)", () => {
    expect(parseInvestRequest({ amount: 100_000, wallet_address: EUR_WALLET.id })).toEqual({ amount: 10_000_000, walletAddress: EUR_WALLET.id });
  });

  it("keys errors by the wire field", () => {
    expect(errorsOf({ amount: 0, wallet_address: "http://w.test/x" })).toEqual({ amount: [expect.any(String)], wallet_address: [expect.any(String)] });
    expect(errorsOf({ amount: 10.5, wallet_address: EUR_WALLET.id })).toEqual({ amount: [expect.any(String)] });
    expect(errorsOf(null)).toEqual({ _form: [expect.any(String)] });
  });
});

describe("investment wire shapes", () => {
  const ids = { toPublic: (id: string) => (id === INVESTOR.id ? "investor-demo" : id), toUser: (id: string) => id };

  it("an investment: pesos for COP, the debit as a minor-unit string with its asset, the exact rate, the public investor id", async () => {
    const store = new InMemoryInvestmentStore();
    store.projects.set("p1", sampleProject());
    const done = await new InvestmentUseCases(store, new FakeCapture(), { now: () => NOW }).invest("p1", INVESTOR, { amount: 10_000_000, walletAddress: EUR_WALLET.id });
    expect(toInvestmentResponse({ ...done, consentRedirectUrl: "https://wallet.test/consent" }, ids)).toEqual({
      id: done.id,
      project_id: "p1",
      investor_id: "investor-demo",
      wallet_address: EUR_WALLET.id,
      status: "CAPTURED",
      failure_reason: null,
      amount: 100_000,
      currency: "COP",
      quote: {
        id: "https://rs.inv.test/quotes/q-1",
        debit_amount: "2250",
        debit_asset_code: "EUR",
        debit_asset_scale: 2,
        receive_amount: 100_000,
        expires_at: "2026-10-17T12:05:00.000Z",
      },
      implied_rate: "40000/9",
      incoming_payment_id: null,
      outgoing_payment_id: `SIM-${done.id}`,
      created_at: NOW.toISOString(),
      captured_at: NOW.toISOString(),
      consent_redirect_url: "https://wallet.test/consent",
    });
  });

  it("the capture bar in pesos", () => {
    expect(
      toCaptureResponse({
        target: 100_000_000,
        raised: 15_000_000,
        progressPct: 15,
        investorsCount: 2,
        byCurrency: [{ currency: "EUR", debited: "3380", received: 15_000_000 }],
        currency: "COP",
        assetScale: 2,
      }),
    ).toEqual({ target_amount: 1_000_000, raised: 150_000, currency: "COP", progress_pct: 15, investors_count: 2, by_currency: [{ currency: "EUR", debited: "3380", received_cop: 150_000 }] });
  });
});

describe("InvestmentCallbackController", () => {
  const WEB = "http://web.test";
  async function setup() {
    const store = new InMemoryInvestmentStore();
    store.projects.set("p1", sampleProject());
    const capture = new FakeCapture();
    capture.mode = "consent";
    const useCases = new InvestmentUseCases(store, capture, { now: () => NOW });
    const pending = await useCases.invest("p1", INVESTOR, { amount: 1_000_000, walletAddress: EUR_WALLET.id });
    return { store, capture, pending, controller: new InvestmentCallbackController(useCases, WEB) };
  }

  it("has no auth guard: the wallet redirects the browser here, the grant nonce and hash protect it", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, InvestmentCallbackController)).toBeUndefined();
    expect(Reflect.getMetadata("path", InvestmentCallbackController.prototype.callback)).toBe("investments/:id/callback");
  });

  it("captures and sends the browser back to the investor's project with capture=ok", async () => {
    const { controller, pending, store } = await setup();
    expect(await controller.callback(pending.id, "ref", "h")).toEqual({ url: `${WEB}/investor/projects/p1?capture=ok`, statusCode: 302 });
    expect(store.ledger).toHaveLength(1);
  });

  it("capture=error when the consent was rejected, the hash fails, the capture failed or the investment is unknown", async () => {
    const rejected = await setup();
    expect(await rejected.controller.callback(rejected.pending.id, undefined, undefined)).toEqual({ url: `${WEB}/investor/projects/p1?capture=error`, statusCode: 302 });

    const forged = await setup();
    forged.capture.completionError = new Error("hash mismatch");
    expect((await forged.controller.callback(forged.pending.id, "ref", "bad")).url).toBe(`${WEB}/investor/projects/p1?capture=error`);

    const failed = await setup();
    failed.capture.completion = { kind: "failed", quote: failed.pending.quote!, reason: "no" };
    expect((await failed.controller.callback(failed.pending.id, "ref", "h")).url).toBe(`${WEB}/investor/projects/p1?capture=error`);

    expect((await failed.controller.callback("nope", "ref", "h")).url).toBe(`${WEB}/investor?capture=error`);
  });
});
