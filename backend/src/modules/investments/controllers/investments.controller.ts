import { Body, Controller, Get, HttpCode, Param, Post, Req, UseFilters } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { PARTY_SIDE, PublicIds } from "../../auth/application/demo-parties";
import { ResolveApiUserUseCase } from "../../auth/application/resolve-api-user.use-case";
import { InvestmentUseCases } from "../application/investments.use-cases";
import { toCaptureResponse, toInvestmentResponse, toInvestorProjectResponse } from "./investments.mappers";
import { parseInvestRequest } from "./investments.requests";

// RF-10 / RF-29 investor capture. No class guard, like the negotiations: without a session (DEMO_IDENTITY=true only) every
// route here acts as the demo investor (inversionista@agro.dev); a real session always wins. Who may read what is decided in
// InvestmentUseCases. Bodies stay unknown so the global ValidationPipe passes them through.
// ponytail: no swagger DTOs for these routes yet.
@ApiTags("investments")
@Controller("api")
@UseFilters(ApiErrorFilter)
export class InvestmentsController {
  constructor(
    private readonly investments: InvestmentUseCases,
    private readonly users: ResolveApiUserUseCase,
    private readonly publicIds: PublicIds,
  ) {}

  private caller = (req: Request) => this.users.execute(req.headers, PARTY_SIDE.INVESTOR);

  /** Subscribes the caller (role investor): 201 CAPTURED (simulated) or PENDING_CONSENT with consent_redirect_url */
  @Post("projects/:projectId/investments")
  @HttpCode(201)
  async invest(@Req() req: Request, @Param("projectId") projectId: string, @Body() body: unknown) {
    const investor = await this.caller(req);
    const [investment, ids] = await Promise.all([this.investments.invest(projectId, investor, parseInvestRequest(body)), this.publicIds.table()]);
    return toInvestmentResponse(investment, ids);
  }

  /** An investor sees their own; the owner producer, admin and fidu see all */
  @Get("projects/:projectId/investments")
  async list(@Req() req: Request, @Param("projectId") projectId: string) {
    const [investments, ids] = await Promise.all([this.investments.listForProject(projectId, await this.caller(req)), this.publicIds.table()]);
    return investments.map((i) => toInvestmentResponse(i, ids));
  }

  @Get("investments/:id")
  async get(@Req() req: Request, @Param("id") id: string) {
    const [investment, ids] = await Promise.all([this.investments.get(id, await this.caller(req)), this.publicIds.table()]);
    return toInvestmentResponse(investment, ids);
  }

  /** The capture bar: captured COP against the target, by the investors' currencies */
  @Get("projects/:projectId/capture")
  async capture(@Req() req: Request, @Param("projectId") projectId: string) {
    return toCaptureResponse(await this.investments.capture(projectId, await this.caller(req)));
  }

  /** The investor catalog: projects still raising (DRAFT, CONTRACT_SIGNED, FUNDING_IN_PROGRESS) with their capture bar */
  @Get("investor/projects")
  async fundable(@Req() req: Request) {
    return (await this.investments.fundable(await this.caller(req))).map(toInvestorProjectResponse);
  }

  /** One project with its capture bar, whatever its status */
  @Get("investor/projects/:projectId")
  async investorProject(@Req() req: Request, @Param("projectId") projectId: string) {
    return toInvestorProjectResponse(await this.investments.projectWithCapture(projectId, await this.caller(req)));
  }
}
