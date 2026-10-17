import { resolve } from "node:path";
import { RequestMethod } from "@nestjs/common";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { z } from "zod";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import type { IdAliases } from "../../auth/application/demo-parties";
import { BUYER, PRODUCER, RedirectCustody, setup } from "../application/testing";
import { toCatalogResponse, toLedgerResponse, toNegotiationResponse, toOpenRequestResponse } from "./api.mappers";
import { DepositCallbackController } from "./deposit-callback.controller";
import { NegotiationsController } from "./negotiations.controller";
import { sideOf } from "./party-side";

type Handler = keyof NegotiationsController;
const meta = (key: string, handler?: string) =>
  Reflect.getMetadata(key, handler ? (NegotiationsController.prototype as unknown as Record<string, object>)[handler] : NegotiationsController);
const route = (handler: Handler) => [RequestMethod[meta(METHOD_METADATA, handler)], `${meta(PATH_METADATA)}/${meta(PATH_METADATA, handler)}`, meta(HTTP_CODE_METADATA, handler)];

describe("NegotiationsController routes", () => {
  it("serves the paths and status codes of the web app's HttpPresaleRepository / HttpEscrowRepository", () => {
    expect(
      (
        [
          "listCatalog",
          "getCatalogProject",
          "startNegotiation",
          "getQuoteRequest",
          "listBuyerQuoteRequests",
          "listProducerQuoteRequests",
          "counter",
          "accept",
          "reject",
          "cancel",
          "decline",
          "withdraw",
          "deposit",
          "ledger",
          "listOpenRequests",
          "createOpenRequest",
          "listBuyerOpenRequests",
          "getOpenRequest",
          "closeOpenRequest",
          "listOpenRequestNegotiations",
          "startOpenRequestNegotiation",
        ] as Handler[]
      ).map(route),
    ).toEqual([
      ["GET", "api/catalog/projects", undefined],
      ["GET", "api/catalog/projects/:projectId", undefined],
      ["POST", "api/projects/:projectId/negotiations", 201],
      ["GET", "api/quote-requests/:id", undefined],
      ["GET", "api/buyers/:buyerId/quote-requests", undefined],
      ["GET", "api/producer/quote-requests", undefined],
      ["POST", "api/quote-requests/:id/quotes", 201],
      ["POST", "api/quote-requests/:id/quotes/:revision/accept", 200],
      ["POST", "api/quote-requests/:id/quotes/:revision/reject", 200],
      ["POST", "api/quote-requests/:id/cancel", 200],
      ["POST", "api/quote-requests/:id/decline", 200],
      ["POST", "api/quote-requests/:id/withdraw", 200],
      ["POST", "api/negotiations/:id/deposit", 200],
      ["GET", "api/projects/:projectId/escrow-ledger", undefined],
      ["GET", "api/open-requests", undefined],
      ["POST", "api/open-requests", 201],
      ["GET", "api/buyers/:buyerId/open-requests", undefined],
      ["GET", "api/open-requests/:id", undefined],
      ["POST", "api/open-requests/:id/close", 200],
      ["GET", "api/open-requests/:id/negotiations", undefined],
      ["POST", "api/open-requests/:id/negotiations", 201],
    ]);
  });

  it("uses the /api error body and resolves identity per handler (no class guard)", () => {
    expect(meta(EXCEPTION_FILTERS_METADATA)).toEqual([ApiErrorFilter]);
    expect(meta(GUARDS_METADATA)).toBeUndefined();
  });

  it("the wallet callback is unauthenticated, under /api/negotiations/:id/deposit/callback", () => {
    const handler = (DepositCallbackController.prototype as unknown as Record<string, object>).callback;
    expect(`${Reflect.getMetadata(PATH_METADATA, DepositCallbackController)}/${Reflect.getMetadata(PATH_METADATA, handler)}`).toBe("api/negotiations/:id/deposit/callback");
    expect(Reflect.getMetadata(GUARDS_METADATA, DepositCallbackController)).toBeUndefined();
  });

  it("picks the demo side from the body's party, with the app's defaults", () => {
    expect([sideOf(undefined, "PRODUCER"), sideOf("BUYER", "PRODUCER"), sideOf(undefined, "BUYER"), sideOf("PRODUCER", "BUYER"), sideOf(42, "BUYER")]).toEqual([
      "producer",
      "buyer",
      "buyer",
      "producer",
      "buyer",
    ]);
  });
});

describe("DepositCallbackController", () => {
  const callbackWith = (completeDeposit: () => Promise<unknown>) =>
    new DepositCallbackController({ completeDeposit } as never, "http://web.test");

  it("302s back to the buyer's negotiation with ?deposit=ok, or ?deposit=error when refused or rejected at the wallet", async () => {
    expect(await callbackWith(async () => ({})).callback("qr-1", "ref", "h")).toEqual({ url: "http://web.test/buyer/negotiations/qr-1?deposit=ok", statusCode: 302 });
    expect(await callbackWith(async () => Promise.reject(new Error("bad hash"))).callback("qr-1", "ref", "h")).toEqual({ url: "http://web.test/buyer/negotiations/qr-1?deposit=error", statusCode: 302 });
    expect(await callbackWith(async () => ({})).callback("qr-1", undefined, undefined)).toEqual({ url: "http://web.test/buyer/negotiations/qr-1?deposit=error", statusCode: 302 });
  });
});

// Contract: the web app's own zod schemas, loaded from this repository at runtime (outside the backend's tsc rootDir, hence the
// untyped dynamic import). Strict at every level, so an extra or misspelled key fails here before it fails in the browser.
const APP = resolve(__dirname, "../../../../../frontend/packages/shared/src/modules");
type AppSchemas = Record<string, z.ZodObject>;
const loadApp = async (): Promise<AppSchemas> => ({
  ...((await import(`${APP}/presales/infrastructure/dto.ts`)) as AppSchemas),
  ...((await import(`${APP}/escrow/infrastructure/dto.ts`)) as AppSchemas),
});
const strict = (schema: z.ZodObject, value: unknown) => schema.strict().parse(JSON.parse(JSON.stringify(value))) as { quotes: unknown[]; history: unknown[] };

const DEMO: IdAliases = {
  toPublic: (id) => ({ [PRODUCER.id]: "producer-main", [BUYER.id]: "buyer-andina" })[id] ?? id,
  toUser: (id) => id,
};

describe("/api responses against the web app's schemas", () => {
  it("negotiations, catalog, ledger and open requests parse strictly, with the demo public ids", async () => {
    const app = await loadApp();
    const { service, built } = setup(new RedirectCustody());
    const milestone = await service.start("p1", BUYER, { scope: "MILESTONE", milestone_id: built[0].id, buyer_id: "x", buyer_name: "x", price: 3_500_000, delivery_date: "2026-12-15" });
    const project = await service.start("p1", BUYER, { scope: "PROJECT", buyer_id: "x", buyer_name: "x", quantity: 10, unit: "TON", unit_price: 1, delivery_date: "2027-02-01", valid_until: "2026-10-30" });
    await service.counter(project.id, PRODUCER, { author: "PRODUCER", quantity: 10, unit: "TON", unit_price: 2, delivery_date: "2027-02-01", valid_until: "2026-10-30" });
    const pending = await service.decide(project.id, 2, "accept", BUYER, { actor: "BUYER", expected_total: 4_500_000 });
    const deposited = await service.completeDeposit(project.id, { interactRef: "r", hash: "good" });

    for (const n of [milestone, pending, deposited, await service.get(milestone.id, [BUYER])]) {
      const parsed = strict(app.quoteRequestDtoSchema, toNegotiationResponse(n, DEMO));
      expect(parsed).toMatchObject({ buyer_id: "buyer-andina", producer_id: "producer-main" });
      for (const q of parsed.quotes) strict(app.saleQuoteDtoSchema, q);
      for (const h of parsed.history) strict(app.historyEntryDtoSchema, h);
    }
    expect(toNegotiationResponse(pending, DEMO)).toMatchObject({ deposit_status: "PENDING", deposit_redirect_url: expect.any(String) });

    for (const e of await service.catalog()) expect(strict(app.catalogProjectDtoSchema, toCatalogResponse(e, DEMO))).toMatchObject({ producer_id: "producer-main", negotiation_locked: true });
    const [entry] = await service.ledger("p1", [BUYER]);
    expect(strict(app.ledgerEntryDtoSchema, toLedgerResponse(entry, DEMO))).toMatchObject({ buyer_id: "buyer-andina", amount: 4_500_000 });

    const open = await service.createOpenRequest(BUYER, {
      buyer_id: "x",
      buyer_name: "x",
      title: "Café pergamino",
      production_type: "CAFE_ESPECIAL",
      quantity: 20,
      unit: "TON",
      delivery_date: "2027-01-30",
      delivery_location: "Medellín",
      notes: "",
    });
    expect(strict(app.openRequestDtoSchema, toOpenRequestResponse(open, DEMO))).toMatchObject({ buyer_id: "buyer-andina", awarded_quantity: 0 });
  });
});
