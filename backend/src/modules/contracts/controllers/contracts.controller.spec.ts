import { RequestMethod } from "@nestjs/common";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { ROLES_KEY } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { buildContractDocument, signContract } from "../application/contract-document";
import { PREMIUM_STATUS } from "../application/insurance";
import { PRICE_TYPE } from "../application/purchase-contract";
import { BUYER_USER, contractContext, FIDU, insurancePolicy, OWNER, purchaseContract } from "../application/testing";
import { ContractsController } from "./contracts.controller";
import { toContractResponse, toPolicyResponse, toPurchaseContractResponse } from "./contracts.mappers";
import { PremiumGrantCallbackController } from "./premium-grant-callback.controller";

const meta = (key: string, handler?: string) =>
  Reflect.getMetadata(key, handler ? (ContractsController.prototype as unknown as Record<string, object>)[handler] : ContractsController);
const route = (handler: string) => [RequestMethod[meta(METHOD_METADATA, handler)], `${meta(PATH_METADATA)}/${meta(PATH_METADATA, handler)}`];
const ids = { toPublic: (id: string) => (id === BUYER_USER.id ? "buyer-andina" : id), toUser: (id: string) => id };

describe("ContractsController", () => {
  it("uses ApiAuthGuard then RolesGuard and the /api error body", () => {
    expect(meta(GUARDS_METADATA)).toEqual([ApiAuthGuard, RolesGuard]);
    expect(meta(EXCEPTION_FILTERS_METADATA)).toEqual([ApiErrorFilter]);
  });

  it("serves the contract and insurance routes under /api", () => {
    expect(route("purchaseContract")).toEqual(["GET", "api/projects/:projectId/purchase-contract"]);
    expect(route("putPurchaseContract")).toEqual(["PUT", "api/projects/:projectId/purchase-contract"]);
    expect(route("policy")).toEqual(["GET", "api/projects/:projectId/insurance-policy"]);
    expect(route("putPolicy")).toEqual(["PUT", "api/projects/:projectId/insurance-policy"]);
    expect(route("startPremiumGrant")).toEqual(["POST", "api/projects/:projectId/insurance-policy/premium-grant"]);
    expect(route("payPremium")).toEqual(["POST", "api/projects/:projectId/insurance-policy/pay-premium"]);
    expect(route("claims")).toEqual(["GET", "api/projects/:projectId/insurance-policy/claims"]);
    expect(route("fileClaim")).toEqual(["POST", "api/projects/:projectId/insurance-policy/claims"]);
    expect(route("confirmClaim")).toEqual(["POST", "api/projects/:projectId/insurance-policy/claims/:claimId/confirm"]);
    expect(route("contract")).toEqual(["GET", "api/projects/:projectId/contract"]);
    expect(route("generateContract")).toEqual(["POST", "api/projects/:projectId/contract"]);
    expect(route("sign")).toEqual(["POST", "api/contracts/:id/signatures"]);
  });

  it("producer and operator write the purchase contract; the fiduciaria and operator move custody; the parties sign", () => {
    expect(meta(ROLES_KEY)).toEqual(["seller", "admin", "fidu", "investor", "buyer"]);
    expect(meta(ROLES_KEY, "putPurchaseContract")).toEqual(["seller", "admin"]);
    expect(meta(ROLES_KEY, "putPolicy")).toEqual(["seller", "admin", "fidu"]);
    for (const handler of ["startPremiumGrant", "payPremium", "fileClaim", "confirmClaim"]) expect(meta(ROLES_KEY, handler)).toEqual(["admin", "fidu"]);
    expect(meta(ROLES_KEY, "generateContract")).toEqual(["seller", "admin", "fidu"]);
    expect(meta(ROLES_KEY, "sign")).toEqual(["seller", "fidu", "investor", "buyer"]);
    expect(meta(HTTP_CODE_METADATA, "fileClaim")).toBe(201);
    expect(meta(HTTP_CODE_METADATA, "sign")).toBe(201);
  });
});

describe("PremiumGrantCallbackController", () => {
  const callback = (complete: () => Promise<void>) =>
    new PremiumGrantCallbackController({ completePremiumGrant: complete } as never, "http://web.test").callback("p-1", "ref", "hash");

  it("redirects to the custodian screen with the outcome", async () => {
    expect(await callback(async () => undefined)).toEqual({ url: "http://web.test/custodian?premium_granted=p-1", statusCode: 302 });
    expect(await callback(async () => Promise.reject(new Error("bad hash")))).toEqual({ url: "http://web.test/custodian?premium_error=p-1", statusCode: 302 });
  });
});

describe("contracts mappers", () => {
  it("speaks snake_case with prices in pesos and the buyer as a public id", () => {
    expect(toPurchaseContractResponse(purchaseContract(), ids, { name: "Comercializadora Andina", email: "comprador@agro.dev" })).toEqual({
      project_id: "p1",
      price_type: "fixed",
      price_per_unit: 1300,
      floor_per_unit: null,
      ceiling_per_unit: null,
      price_reference: null,
      quantity: 85_000,
      unit: "kg",
      currency: "COP",
      settles: true,
      buyer_id: "buyer-andina",
      buyer_name: "Comercializadora Andina",
      buyer_email: "comprador@agro.dev",
      buyer_wallet_address: "https://wallet.test/comprador",
      buyer_wallet_asset_code: "COP",
      updated_at: "2026-10-17T10:00:00.000Z",
    });
    const usd = toPurchaseContractResponse(purchaseContract({ currency: "USD", price: { type: PRICE_TYPE.FORMULA, floorPerUnit: 105, ceilingPerUnit: 150, reference: "CBOT" } }), ids, null);
    expect(usd).toMatchObject({ settles: false, price_type: "formula", floor_per_unit: 1.05, ceiling_per_unit: 1.5, price_reference: "CBOT", buyer_name: null });
  });

  it("shows the policy with its net premium, threshold yield, sum insured and premium payment", () => {
    const at = new Date("2026-10-17T12:00:00Z");
    const policy = insurancePolicy({ premiumPayment: { id: "pay-1", amount: 64_045_800, status: PREMIUM_STATUS.COMPLETED, reference: "REF-1", receipt: null, requestedBy: FIDU.id, requestedAt: at, completedAt: at } });
    expect(toPolicyResponse(policy)).toMatchObject({
      beneficiary: "PATRIMONIO_AUTONOMO",
      premium: 4_269_720,
      subsidy_pct: 85,
      net_premium: 640_458,
      threshold_yield_kg_per_ha: 700,
      sum_insured: 7_000_000,
      insured_price_per_kg: 1000,
      premium_payment: { id: "pay-1", amount: 640_458, status: "completed", reference: "REF-1", completed_at: at.toISOString() },
    });
  });

  it("shows the contract status, each party's signature and what the viewer can still sign", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    const doc = signContract(buildContractDocument({ id: "c1", version: 1, context: contractContext(), createdBy: OWNER.id, now }), OWNER, { ip: "1.1.1.1", userAgent: "ua" }, now);
    const response = toContractResponse(doc, ids, BUYER_USER);
    expect(response).toMatchObject({ id: "c1", version: 1, status: "pending_signatures", signable_roles: ["buyer"] });
    expect(response.parties.find((p) => p.role === "producer")).toEqual({ role: "producer", user_id: OWNER.id, name: "Pedro Productor", signed: true });
    expect(response.parties.find((p) => p.role === "buyer")).toEqual({ role: "buyer", user_id: "buyer-andina", name: "Comercializadora Andina", signed: false });
    expect(response.signatures).toEqual([{ party_role: "producer", user_id: OWNER.id, signed_at: now.toISOString(), contract_hash: doc.hash }]);
  });
});
