import { Body, Controller, Get, HttpCode, Param, Post, Req, UseFilters } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { PARTY_SIDE, type PartySide, PublicIds } from "../../auth/application/demo-parties";
import { ResolveApiUserUseCase } from "../../auth/application/resolve-api-user.use-case";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { HarvestUseCases } from "../application/harvest.use-cases";
import { InvestorPanelUseCases } from "../application/investor-panel.use-cases";
import { toCustodyResponse, toHarvestResponse, toPanelResponse } from "./harvest.mappers";
import { parseCertifyRequest, parseDeclareRequest } from "./harvest.requests";

const { BUYER, PRODUCER, INVESTOR } = PARTY_SIDE;

// PRD v3 RF-24 harvest, RF-21 custody balance and RF-27 investor panel. No class guard, like the negotiations and investments:
// without a session (DEMO_IDENTITY=true only) each route acts as the demo user of its side (producer declares, buyer pays and
// confirms, investor reads the panel); the verifier must sign in. Roles and visibility are decided in the use cases.
// Bodies stay unknown so the global ValidationPipe passes them through.
// ponytail: no swagger DTOs and openapi.yaml not regenerated for these routes yet (`pnpm openapi`).
@ApiTags("harvest")
@Controller("api")
@UseFilters(ApiErrorFilter)
export class HarvestController {
  constructor(
    private readonly harvests: HarvestUseCases,
    private readonly panels: InvestorPanelUseCases,
    private readonly users: ResolveApiUserUseCase,
    private readonly publicIds: PublicIds,
  ) {}

  private as = (req: Request, side: PartySide) => this.users.execute(req.headers, side);

  /** Reads either demo party may make: the first candidate allowed to see it wins (a real session is the only candidate). */
  private async asAnyone<T>(req: Request, work: (user: AuthenticatedUser) => Promise<T>): Promise<T> {
    let failure: unknown;
    for (const user of await this.users.candidates(req.headers)) {
      try {
        return await work(user);
      } catch (error) {
        failure = error;
      }
    }
    throw failure;
  }

  private async envelope(projectId: string, viewer: AuthenticatedUser, redirectUrl: string | null = null) {
    const [{ project, harvest }, ids] = await Promise.all([this.harvests.get(projectId, viewer), this.publicIds.table()]);
    return toHarvestResponse(project, harvest, ids, redirectUrl);
  }

  /** RF-24: the verifier's queue, every harvest with its project (verifier or admin; the verifier must sign in) */
  @Get("harvests")
  async list(@Req() req: Request) {
    const [rows, ids] = await Promise.all([this.harvests.listForReview(await this.as(req, PRODUCER)), this.publicIds.table()]);
    return rows.map(({ project, harvest }) => toHarvestResponse(project, harvest, ids));
  }

  /** The project's harvest (null before the declaration) and project status */
  @Get("projects/:projectId/harvest")
  async get(@Req() req: Request, @Param("projectId") projectId: string) {
    return this.asAnyone(req, (user) => this.envelope(projectId, user));
  }

  /** The owner producer declares the harvest: HARVEST_DECLARED */
  @Post("projects/:projectId/harvest")
  @HttpCode(201)
  async declare(@Req() req: Request, @Param("projectId") projectId: string, @Body() body: unknown) {
    const producer = await this.as(req, PRODUCER);
    await this.harvests.declare(projectId, producer, parseDeclareRequest(body));
    return this.envelope(projectId, producer);
  }

  /** The verifier certifies Q and quality; the contract formula (or the request's price) sets Q·P_g: HARVEST_CERTIFIED */
  @Post("projects/:projectId/harvest/certify")
  @HttpCode(200)
  async certify(@Req() req: Request, @Param("projectId") projectId: string, @Body() body: unknown) {
    const verifier = await this.as(req, PRODUCER);
    await this.harvests.certify(projectId, verifier, parseCertifyRequest(body));
    return this.envelope(projectId, verifier);
  }

  /** The buyer pays Q·P_g into custody: MARKET_PAYMENT_HELD at once (simulated) or payment_redirect_url to approve in the wallet */
  @Post("projects/:projectId/harvest/payment")
  @HttpCode(200)
  async pay(@Req() req: Request, @Param("projectId") projectId: string) {
    const buyer = await this.as(req, BUYER);
    const { redirectUrl } = await this.harvests.pay(projectId, buyer);
    return this.envelope(projectId, buyer, redirectUrl);
  }

  /** The paying buyer confirms reception: DELIVERED_TO_BUYER, which lets the settlement execute */
  @Post("projects/:projectId/harvest/reception")
  @HttpCode(200)
  async reception(@Req() req: Request, @Param("projectId") projectId: string) {
    const buyer = await this.as(req, BUYER);
    await this.harvests.confirmReception(projectId, buyer);
    return this.envelope(projectId, buyer);
  }

  /** RF-21: what is still in custody, with credits by category and debits (milestone lines, liquidation payouts) */
  @Get("projects/:projectId/custody")
  async custody(@Req() req: Request, @Param("projectId") projectId: string) {
    return this.asAnyone(req, async (user) => toCustodyResponse(projectId, await this.panels.custody(projectId, user)));
  }

  /** RF-27: the investor's position (every investment for fidu and admin): capture, custody, grants, receipts, realized vs median TIR */
  @Get("investor/projects/:projectId/panel")
  async panel(@Req() req: Request, @Param("projectId") projectId: string) {
    const [panel, ids] = await Promise.all([this.panels.panel(projectId, await this.as(req, INVESTOR)), this.publicIds.table()]);
    return toPanelResponse(panel, ids);
  }
}
