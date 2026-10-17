import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseFilters, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { PublicIds } from "../../auth/application/demo-parties";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { CurrentUser } from "../../auth/controllers/current-user.decorator";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { UserDirectory } from "../../auth/ports/user-directory";
import { MILESTONE_ROLES } from "../../milestones/controllers/milestone-roles";
import { ContractsUseCases } from "../application/contracts.use-cases";
import type { PurchaseContract } from "../application/purchase-contract";
import { toClaimResponse, toContractResponse, toPolicyResponse, toPurchaseContractResponse } from "./contracts.mappers";
import { parseClaim, parsePolicy, parsePurchaseContract } from "./contracts.requests";

const { producer, operator, fiduciaria, investor } = MILESTONE_ROLES;
const buyer = "buyer";

// RF-04 purchase contract, RF-05 policy, RF-14 premium from custody, RF-25 indemnity into custody, RF-09 contract and signatures.
// The producer (seller) and operator (admin) write the purchase contract; the fiduciaria (fidu) and operator move custody.
// ponytail: no swagger DTOs and openapi.yaml not regenerated for these routes yet (`pnpm openapi`).
@ApiTags("contracts")
@Controller("api")
@UseGuards(ApiAuthGuard, RolesGuard)
@UseFilters(ApiErrorFilter)
@Roles(producer, operator, fiduciaria, investor, buyer)
export class ContractsController {
  constructor(
    private readonly contracts: ContractsUseCases,
    private readonly ids: PublicIds,
    private readonly users: UserDirectory,
  ) {}

  private async purchaseResponse(c: PurchaseContract) {
    const [ids, buyerUser] = await Promise.all([this.ids.table(), this.users.findById(c.buyerUserId)]);
    return toPurchaseContractResponse(c, ids, buyerUser);
  }

  /** RF-04; 404 while the project has none */
  @Get("projects/:projectId/purchase-contract")
  async purchaseContract(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.purchaseResponse(await this.contracts.getPurchaseContract(projectId, user));
  }

  /** RF-04: creates or replaces it before publishing; the buyer by email, their wallet validated (GET in open-payments mode) */
  @Put("projects/:projectId/purchase-contract")
  @Roles(producer, operator)
  @HttpCode(200)
  async putPurchaseContract(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.purchaseResponse(await this.contracts.putPurchaseContract(projectId, user, parsePurchaseContract(body)));
  }

  /** RF-05; 404 while the project has none */
  @Get("projects/:projectId/insurance-policy")
  async policy(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return toPolicyResponse(await this.contracts.getPolicy(projectId, user));
  }

  /** RF-05: the latest simulation's premium and terms win; without one they come in the body. 409 once the premium was paid */
  @Put("projects/:projectId/insurance-policy")
  @Roles(producer, operator, fiduciaria)
  @HttpCode(200)
  async putPolicy(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return toPolicyResponse(await this.contracts.putPolicy(projectId, user, parsePolicy(body)));
  }

  /** RF-14: the fiduciaria approves the premium grant on custody (net premium cap); redirect_url is null in simulated mode */
  @Post("projects/:projectId/insurance-policy/premium-grant")
  @Roles(operator, fiduciaria)
  @HttpCode(200)
  async startPremiumGrant(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    const started = await this.contracts.startPremiumGrant(projectId, user);
    return { redirect_url: started?.redirectUrl ?? null };
  }

  /** RF-14: pays the net premium from custody to the insurer (or syncs one in flight); 409 before activation or without the grant */
  @Post("projects/:projectId/insurance-policy/pay-premium")
  @Roles(operator, fiduciaria)
  @HttpCode(200)
  async payPremium(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return toPolicyResponse(await this.contracts.payPremium(projectId, user));
  }

  @Get("projects/:projectId/insurance-policy/claims")
  async claims(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return (await this.contracts.listClaims(projectId, user)).map(toClaimResponse);
  }

  /** RF-25: validates the threshold or index rule and computes the A6 indemnity; in open-payments mode opens the incoming payment on custody */
  @Post("projects/:projectId/insurance-policy/claims")
  @Roles(operator, fiduciaria)
  @HttpCode(201)
  async fileClaim(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return toClaimResponse(await this.contracts.fileClaim(projectId, user, parseClaim(body)));
  }

  /** RF-25: books the indemnity into custody (ledger CREDIT INDEMNITY); in open-payments mode only once the insurer paid it */
  @Post("projects/:projectId/insurance-policy/claims/:claimId/confirm")
  @Roles(operator, fiduciaria)
  @HttpCode(200)
  async confirmClaim(@Param("projectId") projectId: string, @Param("claimId") claimId: string, @CurrentUser() user: AuthenticatedUser) {
    return toClaimResponse(await this.contracts.confirmClaim(projectId, claimId, user));
  }

  /** RF-09: the latest version with its signatures; the parties (the buyer included) read it */
  @Get("projects/:projectId/contract")
  async contract(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return toContractResponse(await this.contracts.getContract(projectId, user), await this.ids.table(), user);
  }

  /** RF-09: renders the template; unchanged terms answer the current version, changed ones a new version without signatures */
  @Post("projects/:projectId/contract")
  @Roles(producer, operator, fiduciaria)
  @HttpCode(200)
  async generateContract(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return toContractResponse(await this.contracts.generateContract(projectId, user), await this.ids.table(), user);
  }

  /** RF-09: the caller signs every party they are on the latest version (user, role, time, ip, user agent, hash) */
  @Post("contracts/:id/signatures")
  @Roles(producer, fiduciaria, investor, buyer)
  @HttpCode(201)
  async sign(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const userAgent = req.headers["user-agent"];
    const signed = await this.contracts.sign(id, user, { ip: req.ip ?? null, userAgent: typeof userAgent === "string" ? userAgent : null });
    return toContractResponse(signed, await this.ids.table(), user);
  }
}
