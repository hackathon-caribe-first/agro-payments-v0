import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Req, UseFilters } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { PARTY_SIDE, type PartySide, PublicIds } from "../../auth/application/demo-parties";
import { ResolveApiUserUseCase } from "../../auth/application/resolve-api-user.use-case";
import { NegotiationsService } from "../application/negotiations.service";
import { toCatalogResponse, toLedgerResponse, toNegotiationResponse, toOpenRequestResponse } from "./api.mappers";
import { partyField, sideOf } from "./party-side";

const { BUYER, PRODUCER } = PARTY_SIDE;

// The web app's presales contract (frontend/packages/shared/src/modules/{presales,escrow}/infrastructure/http-*-repository.ts).
// No class guard: which demo user a session-less request acts as depends on the route and sometimes the body (party-side.ts),
// so each handler resolves its caller. 400/409 bodies are { error: "Request rejected", errors: { field | _form: [msg] } }.
// Bodies stay unknown so the global ValidationPipe passes them through; the ported zod schemas own the field rules.
@ApiTags("negotiations")
@Controller("api")
@UseFilters(ApiErrorFilter)
export class NegotiationsController {
  constructor(
    private readonly service: NegotiationsService,
    private readonly users: ResolveApiUserUseCase,
    private readonly publicIds: PublicIds,
  ) {}

  private as = (req: Request, side: PartySide) => this.users.execute(req.headers, side);
  private ids = () => this.publicIds.table();
  private async negotiation<T extends Parameters<typeof toNegotiationResponse>[0]>(work: Promise<T>) {
    const [result, ids] = await Promise.all([work, this.ids()]);
    return toNegotiationResponse(result, ids);
  }
  private async negotiations(work: Promise<Parameters<typeof toNegotiationResponse>[0][]>) {
    const [results, ids] = await Promise.all([work, this.ids()]);
    return results.map((n) => toNegotiationResponse(n, ids));
  }

  /** Every project that is not cancelled, with its producer and derived negotiation locks */
  @Get("catalog/projects")
  async listCatalog(@Req() req: Request) {
    await this.as(req, BUYER);
    const [entries, ids] = await Promise.all([this.service.catalog(), this.ids()]);
    return entries.map((e) => toCatalogResponse(e, ids));
  }

  @Get("catalog/projects/:projectId")
  async getCatalogProject(@Req() req: Request, @Param("projectId") projectId: string) {
    await this.as(req, BUYER);
    const [entry, ids] = await Promise.all([this.service.catalogProject(projectId), this.ids()]);
    return toCatalogResponse(entry, ids);
  }

  /** The buyer opens a negotiation on the project (scope PROJECT) or on one milestone (scope MILESTONE) */
  @Post("projects/:projectId/negotiations")
  @HttpCode(201)
  async startNegotiation(@Req() req: Request, @Param("projectId") projectId: string, @Body() body: unknown) {
    return this.negotiation(this.service.start(projectId, await this.as(req, BUYER), body));
  }

  @Get("quote-requests/:id")
  async getQuoteRequest(@Req() req: Request, @Param("id") id: string) {
    return this.negotiation(this.service.get(id, await this.users.candidates(req.headers)));
  }

  @Get("buyers/:buyerId/quote-requests")
  async listBuyerQuoteRequests(@Req() req: Request, @Param("buyerId") buyerId: string) {
    const user = await this.as(req, BUYER);
    return this.negotiations(this.service.listForBuyer((await this.ids()).toUser(buyerId), user));
  }

  @Get("producer/quote-requests")
  async listProducerQuoteRequests(@Req() req: Request, @Query("project_id") projectId?: string, @Query("producer_id") producerId?: string) {
    const user = await this.as(req, PRODUCER);
    return this.negotiations(this.service.listForProducer(user, projectId, producerId ? (await this.ids()).toUser(producerId) : undefined));
  }

  /** An offer or counter-offer; `author` (default PRODUCER) must be the caller's side of the negotiation */
  @Post("quote-requests/:id/quotes")
  @HttpCode(201)
  async counter(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.negotiation(this.service.counter(id, await this.as(req, sideOf(partyField(body, "author"), "PRODUCER")), body));
  }

  /** Accepts the latest offer; a BUYER accept of a PROJECT offer also deposits (or returns deposit_redirect_url in open-payments mode) */
  @Post("quote-requests/:id/quotes/:revision/accept")
  @HttpCode(200)
  async accept(@Req() req: Request, @Param("id") id: string, @Param("revision", ParseIntPipe) revision: number, @Body() body: unknown) {
    return this.negotiation(this.service.decide(id, revision, "accept", await this.as(req, sideOf(partyField(body, "actor"), "BUYER")), body));
  }

  @Post("quote-requests/:id/quotes/:revision/reject")
  @HttpCode(200)
  async reject(@Req() req: Request, @Param("id") id: string, @Param("revision", ParseIntPipe) revision: number, @Body() body: unknown) {
    return this.negotiation(this.service.decide(id, revision, "reject", await this.as(req, sideOf(partyField(body, "actor"), "BUYER")), body));
  }

  @Post("quote-requests/:id/cancel")
  @HttpCode(200)
  async cancel(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.negotiation(this.service.end(id, "cancel", await this.as(req, BUYER), body));
  }

  @Post("quote-requests/:id/decline")
  @HttpCode(200)
  async decline(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.negotiation(this.service.end(id, "decline", await this.as(req, PRODUCER), body));
  }

  @Post("quote-requests/:id/withdraw")
  @HttpCode(200)
  async withdraw(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.negotiation(this.service.end(id, "withdraw", await this.as(req, sideOf(partyField(body, "actor"), "BUYER")), body));
  }

  /** Executes the pending deposit of an agreed PROJECT negotiation; in open-payments mode answers PENDING + deposit_redirect_url */
  @Post("negotiations/:id/deposit")
  @HttpCode(200)
  async deposit(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.negotiation(this.service.deposit(id, await this.as(req, BUYER), body));
  }

  /** The project's custody ledger (buyer deposits) */
  @Get("projects/:projectId/escrow-ledger")
  async ledger(@Req() req: Request, @Param("projectId") projectId: string) {
    const [entries, ids] = await Promise.all([this.service.ledger(projectId, await this.users.candidates(req.headers)), this.ids()]);
    return entries.map((e) => toLedgerResponse(e, ids));
  }

  // ---- open requests ----

  @Get("open-requests")
  async listOpenRequests(@Req() req: Request, @Query("status") status?: string) {
    await this.users.candidates(req.headers);
    const [list, ids] = await Promise.all([this.service.listOpenRequests(status), this.ids()]);
    return list.map((o) => toOpenRequestResponse(o, ids));
  }

  @Post("open-requests")
  @HttpCode(201)
  async createOpenRequest(@Req() req: Request, @Body() body: unknown) {
    const [created, ids] = await Promise.all([this.service.createOpenRequest(await this.as(req, BUYER), body), this.ids()]);
    return toOpenRequestResponse(created, ids);
  }

  @Get("buyers/:buyerId/open-requests")
  async listBuyerOpenRequests(@Req() req: Request, @Param("buyerId") buyerId: string) {
    const user = await this.as(req, BUYER);
    const ids = await this.ids();
    return (await this.service.listBuyerOpenRequests(ids.toUser(buyerId), user)).map((o) => toOpenRequestResponse(o, ids));
  }

  @Get("open-requests/:id")
  async getOpenRequest(@Req() req: Request, @Param("id") id: string) {
    await this.users.candidates(req.headers);
    const [found, ids] = await Promise.all([this.service.getOpenRequest(id), this.ids()]);
    return toOpenRequestResponse(found, ids);
  }

  @Post("open-requests/:id/close")
  @HttpCode(200)
  async closeOpenRequest(@Req() req: Request, @Param("id") id: string) {
    const [closed, ids] = await Promise.all([this.service.closeOpenRequest(id, await this.as(req, BUYER)), this.ids()]);
    return toOpenRequestResponse(closed, ids);
  }

  @Get("open-requests/:id/negotiations")
  async listOpenRequestNegotiations(@Req() req: Request, @Param("id") id: string) {
    await this.users.candidates(req.headers);
    return this.negotiations(this.service.openRequestNegotiations(id));
  }

  /** A producer's first offer on an open request, backed by one of their own projects */
  @Post("open-requests/:id/negotiations")
  @HttpCode(201)
  async startOpenRequestNegotiation(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.negotiation(this.service.startOnOpenRequest(id, await this.as(req, PRODUCER), body));
  }
}
