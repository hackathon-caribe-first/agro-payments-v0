import { Body, Controller, Get, HttpCode, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { CurrentUser } from "../../auth/controllers/current-user.decorator";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { MILESTONE_ROLES } from "../../milestones/controllers/milestone-roles";
import { SettlementUseCases } from "../application/settlement.use-cases";
import { toPlanResponse, toSettlementResponse } from "./settlement.mappers";
import { parseSettlementRequest } from "./settlement.requests";

const { producer, operator, fiduciaria, investor } = MILESTONE_ROLES;

// RF-26 liquidation cascade. The operator (admin) and the fiduciaria (fidu) preview, create, approve and execute;
// the project's producer and investors read it. Bodies stay unknown so the global ValidationPipe passes them through.
// ponytail: no swagger DTOs and openapi.yaml not regenerated for these routes yet (`pnpm openapi`).
@ApiTags("settlement")
@Controller("api")
@UseGuards(ApiAuthGuard, RolesGuard)
@UseFilters(ApiErrorFilter)
@Roles(producer, operator, fiduciaria, investor)
export class SettlementController {
  constructor(private readonly settlements: SettlementUseCases) {}

  /** The cascade for these terms; nothing is stored. Amounts in whole pesos. */
  @Post("projects/:projectId/settlement/preview")
  @Roles(operator, fiduciaria)
  @HttpCode(200)
  async preview(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const preview = await this.settlements.preview(projectId, user, parseSettlementRequest(body));
    return { project_id: preview.project.id, ...toPlanResponse({ ...preview, currency: preview.project.currency, assetScale: preview.project.assetScale }) };
  }

  /** Stores the cascade as a draft settlement; 409 while the project has an approved, executing or executed one */
  @Post("projects/:projectId/settlement")
  @Roles(operator, fiduciaria)
  @HttpCode(201)
  async create(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return toSettlementResponse(await this.settlements.create(projectId, user, parseSettlementRequest(body)));
  }

  /** draft → approved */
  @Post("settlements/:id/approve")
  @Roles(operator, fiduciaria)
  @HttpCode(200)
  async approve(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return toSettlementResponse(await this.settlements.approve(id, user));
  }

  /** Pays pending payouts and syncs those in flight; call again until executed. 409 when the gateway refuses a payout, or in open-payments mode before the liquidation grant is approved. */
  @Post("settlements/:id/execute")
  @Roles(operator, fiduciaria)
  @HttpCode(200)
  async execute(@Param("id") id: string) {
    return toSettlementResponse(await this.settlements.execute(id));
  }

  /** RF-26: the fiduciaria approves the liquidation grant on custody (Σ COP payouts); redirect_url is null in simulated mode (nothing to approve). 409 unless approved */
  @Post("settlements/:id/liquidation-grant")
  @Roles(operator, fiduciaria)
  @HttpCode(200)
  async startLiquidationGrant(@Param("id") id: string) {
    const started = await this.settlements.startLiquidationGrant(id);
    return { redirect_url: started?.redirectUrl ?? null };
  }

  /** A settlement with its plan, payouts and receipts; another producer's is a 404 */
  @Get("settlements/:id")
  async get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return toSettlementResponse(await this.settlements.get(id, user));
  }
}
