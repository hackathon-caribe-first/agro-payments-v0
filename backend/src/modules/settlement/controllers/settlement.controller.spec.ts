import { RequestMethod } from "@nestjs/common";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { ROLES_KEY } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { approveSettlement, startExecution, applyPayoutResult } from "../application/settlement";
import { sampleSettlement } from "../application/testing";
import { SettlementController } from "./settlement.controller";
import { toSettlementResponse } from "./settlement.mappers";

const meta = (key: string, handler?: string) =>
  Reflect.getMetadata(key, handler ? (SettlementController.prototype as unknown as Record<string, object>)[handler] : SettlementController);
const route = (handler: string) => [RequestMethod[meta(METHOD_METADATA, handler)], `${meta(PATH_METADATA)}/${meta(PATH_METADATA, handler)}`];

describe("SettlementController", () => {
  it("uses ApiAuthGuard then RolesGuard and the /api error body", () => {
    expect(meta(GUARDS_METADATA)).toEqual([ApiAuthGuard, RolesGuard]);
    expect(meta(EXCEPTION_FILTERS_METADATA)).toEqual([ApiErrorFilter]);
  });

  it("serves the settlement routes under /api", () => {
    expect(route("preview")).toEqual(["POST", "api/projects/:projectId/settlement/preview"]);
    expect(route("create")).toEqual(["POST", "api/projects/:projectId/settlement"]);
    expect(route("approve")).toEqual(["POST", "api/settlements/:id/approve"]);
    expect(route("execute")).toEqual(["POST", "api/settlements/:id/execute"]);
    expect(route("get")).toEqual(["GET", "api/settlements/:id"]);
  });

  it("lets only the operator (admin) and the fiduciaria (fidu) write; producer and investors read", () => {
    expect(meta(ROLES_KEY)).toEqual(["seller", "admin", "fidu", "investor"]);
    for (const handler of ["preview", "create", "approve", "execute"]) expect(meta(ROLES_KEY, handler)).toEqual(["admin", "fidu"]);
    expect(meta(ROLES_KEY, "get")).toBeUndefined();
  });

  it("answers 200 except 201 on create", () => {
    expect(meta(HTTP_CODE_METADATA, "preview")).toBe(200);
    expect(meta(HTTP_CODE_METADATA, "create")).toBe(201);
    expect(meta(HTTP_CODE_METADATA, "approve")).toBe(200);
    expect(meta(HTTP_CODE_METADATA, "execute")).toBe(200);
  });
});

describe("toSettlementResponse", () => {
  it("speaks snake_case in whole pesos, keeping receipt amounts in their own minor units", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    let s = startExecution(approveSettlement(sampleSettlement(), "u-fidu", now));
    s = applyPayoutResult(s, "investor-inv-eur", { status: "en_cola", reference: "SIM-1", receipt: { debitAmount: { value: 56_400_000, assetCode: "COP", assetScale: 2 } } }, now);
    const response = toSettlementResponse(s);
    expect(response).toMatchObject({
      id: "s1",
      project_id: "p1",
      status: "executing",
      currency: "COP",
      proceeds: 2_000_000,
      days: 365,
      preferred_rate_pct: 12,
      investors_total: 1_410_000,
      shortfall: 0,
      approved_by: "u-fidu",
      approved_at: "2026-10-17T12:00:00.000Z",
      executed_at: null,
    });
    expect(response.tiers[4]).toEqual({
      tier: "surplus",
      claim: null,
      paid: 580_000,
      allocations: [
        { beneficiary_kind: "investor", beneficiary_id: "inv-cop", amount: 174_000 },
        { beneficiary_kind: "investor", beneficiary_id: "inv-eur", amount: 116_000 },
        { beneficiary_kind: "producer", beneficiary_id: "producer", amount: 174_000 },
        { beneficiary_kind: "platform", beneficiary_id: "platform", amount: 116_000 },
      ],
    });
    expect(response.payouts.find((p) => p.id === "investor-inv-eur")).toMatchObject({
      wallet_currency: "EUR",
      amount: 564_000,
      fixed_debit_amount: true,
      status: "executing",
      reference: "SIM-1",
      receipt: { debit_amount: { value: 56_400_000, asset_code: "COP", asset_scale: 2 }, receive_amount: null },
    });
  });
});
