import { RequestMethod } from "@nestjs/common";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { ROLES_KEY } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { toOrderIntent } from "../../assistant/application/order-intents";
import { orderIntent } from "../application/testing";
import { toOrderResponse } from "./payouts.mappers";
import { PayoutsController } from "./payouts.controller";

const meta = (key: string, handler?: string) =>
  Reflect.getMetadata(key, handler ? (PayoutsController.prototype as unknown as Record<string, object>)[handler] : PayoutsController);
const route = (handler: string) => [RequestMethod[meta(METHOD_METADATA, handler)], `${meta(PATH_METADATA)}/${meta(PATH_METADATA, handler)}`];

describe("PayoutsController", () => {
  it("uses ApiAuthGuard then RolesGuard and the /api error body", () => {
    expect(meta(GUARDS_METADATA)).toEqual([ApiAuthGuard, RolesGuard]);
    expect(meta(EXCEPTION_FILTERS_METADATA)).toEqual([ApiErrorFilter]);
  });

  it("serves suppliers and milestone orders under /api", () => {
    expect(route("registerSupplier")).toEqual(["POST", "api/suppliers"]);
    expect(route("listSuppliers")).toEqual(["GET", "api/suppliers"]);
    expect(route("listOrders")).toEqual(["GET", "api/milestones/:id/orders"]);
    expect(route("approveOrder")).toEqual(["POST", "api/milestones/:id/orders/:intentId/approve"]);
    expect(route("rejectOrder")).toEqual(["POST", "api/milestones/:id/orders/:intentId/reject"]);
    expect(meta(HTTP_CODE_METADATA, "registerSupplier")).toBe(201);
    expect(meta(HTTP_CODE_METADATA, "approveOrder")).toBe(200);
  });

  // Operator (admin) or fiduciaria (fidu) decide orders and register suppliers; the producer only reads the supplier list.
  it("lets only the operator and the fiduciaria write", () => {
    expect(meta(ROLES_KEY)).toEqual(["admin", "fidu"]);
    expect(meta(ROLES_KEY, "listSuppliers")).toEqual(["admin", "fidu", "seller"]);
    for (const h of ["registerSupplier", "listOrders", "approveOrder", "rejectOrder"]) expect(meta(ROLES_KEY, h)).toBeUndefined();
  });

  it("maps an order with snake_case keys and whole pesos", () => {
    expect(toOrderResponse(toOrderIntent(orderIntent("i-1", "m1", 2_500_000))!)).toMatchObject({
      id: "i-1",
      milestone_id: "m1",
      supplier: "Almacén Don Pedro",
      total: 2_500_000,
      approval: "pending",
      line_id: null,
      confirmed_at: "2026-10-17T10:01:00.000Z",
    });
  });
});
