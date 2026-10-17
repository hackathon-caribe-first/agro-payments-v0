import { Body, Controller, Get, HttpCode, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { CurrentUser } from "../../auth/controllers/current-user.decorator";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { remainingCap } from "../../milestones/application/milestone";
import { MILESTONE_ROLES } from "../../milestones/controllers/milestone-roles";
import { minorToPesos } from "../../projects/application/project";
import { OrderApprovalUseCases } from "../application/order-approval.use-cases";
import { SuppliersUseCases } from "../application/suppliers.use-cases";
import { toOrderResponse, toSupplierResponse } from "./payouts.mappers";

const { operator, fiduciaria, producer } = MILESTONE_ROLES;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const optionalText = (body: unknown, key: string) => (isRecord(body) && typeof body[key] === "string" ? (body[key] as string) : null);

// RF-15 supplier registry and the approval of the assistant's confirmed orders into milestone lines (RF-16, RF-34).
// Bodies stay unknown so the global ValidationPipe passes them through.
// ponytail: no swagger DTOs and openapi.yaml not regenerated for these routes yet (`pnpm openapi`).
@ApiTags("payouts")
@Controller("api")
@UseGuards(ApiAuthGuard, RolesGuard)
@UseFilters(ApiErrorFilter)
@Roles(operator, fiduciaria)
export class PayoutsController {
  constructor(
    private readonly suppliers: SuppliersUseCases,
    private readonly orders: OrderApprovalUseCases,
  ) {}

  /** Registers a supplier; 400 unless its wallet resolves and receives COP, 409 for a repeated name */
  @Post("suppliers")
  @HttpCode(201)
  async registerSupplier(@Body() body: unknown) {
    return toSupplierResponse(await this.suppliers.register(body));
  }

  /** Registered suppliers, oldest first */
  @Get("suppliers")
  @Roles(operator, fiduciaria, producer)
  async listSuppliers() {
    return (await this.suppliers.list()).map(toSupplierResponse);
  }

  /** Orders the producer confirmed through the assistant for this milestone, with their approval state */
  @Get("milestones/:id/orders")
  async listOrders(@Param("id") id: string) {
    return (await this.orders.list(id)).map(toOrderResponse);
  }

  /** Turns a confirmed order into a proveedor line of the milestone (remaining_cap in whole pesos after it); 409 when it does not fit the cap or the supplier is not registered */
  @Post("milestones/:id/orders/:intentId/approve")
  @HttpCode(200)
  async approveOrder(@Param("id") id: string, @Param("intentId") intentId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { order, milestone } = await this.orders.approve(id, intentId, { supplierId: optionalText(body, "supplier_id") }, user.id);
    return { order: toOrderResponse(order), remaining_cap: minorToPesos(remainingCap(milestone), milestone.assetScale) };
  }

  /** Rejects a confirmed order; no line is created */
  @Post("milestones/:id/orders/:intentId/reject")
  @HttpCode(200)
  async rejectOrder(@Param("id") id: string, @Param("intentId") intentId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return toOrderResponse(await this.orders.reject(id, intentId, optionalText(body, "reason"), user.id));
  }
}
