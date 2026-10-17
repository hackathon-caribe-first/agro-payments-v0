import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { FORM_LEVEL_KEY, type FieldErrors, NotFoundError, RejectedError, ValidationError } from "../../../shared/domain-errors";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { UserDirectory } from "../../auth/ports/user-directory";
import { MilestoneRepository } from "../../milestones/ports/milestone.repository";
import type { FundingCallback } from "../../milestones/ports/milestone-funding";
import { custodyGate, pesosToMinor, PROJECT_STATUS, type Project } from "../../projects/application/project";
import { viewsOf } from "../../projects/application/project-queries";
import { toMilestoneSummaryResponse } from "../../projects/controllers/api.mappers";
import { applyProjectDeposit } from "../domain/deposit";
import { toFieldErrors, toOpenRequest, toQuoteRequest } from "../domain/mapper";
import {
  type AgreeBlock,
  agreedMilestonePrices,
  autoCloseOthers,
  canAgree,
  canDeposit,
  canStart,
  catalogLocks,
  hasLiveNegotiation,
  type StartBlock,
} from "../domain/negotiation-rules";
import type { OfferTerms } from "../domain/presale";
import {
  allocationGuard,
  backingProjectBlock,
  canAct,
  canStartOnOpenRequest,
  effectiveQuoteStatus,
  effectiveRequestStatus,
  hasActiveNegotiation,
  isoToday,
  latestQuote,
  quantityCap,
  remainingToAward,
  saleQuoteTotal,
} from "../domain/presale-rules";
import { type MilestoneStatus, projectQuotationTotal } from "../domain/project-rules";
import { buildCounterOfferSchema, capMessage } from "../domain/schemas/counter-offer";
import { buildCreateOpenRequestSchema } from "../domain/schemas/create-open-request";
import { buildMilestoneCounterSchema, buildStartMilestoneNegotiationSchema } from "../domain/schemas/start-milestone-negotiation";
import { buildStartOpenRequestNegotiationSchema } from "../domain/schemas/start-open-request-negotiation";
import { buildProjectCounterSchema, buildStartProjectNegotiationSchema } from "../domain/schemas/start-project-negotiation";
import { nextStatus, OPEN_REQUEST_TRANSITIONS, QUOTE_TRANSITIONS, REQUEST_TRANSITIONS } from "../domain/transitions";
import {
  actorBodyDtoSchema,
  createOpenRequestDtoSchema,
  depositBodyDtoSchema,
  type OpenRequestDto,
  respondRequestDtoSchema,
  type SaleQuoteDto,
  startNegotiationDtoSchema,
  startOpenRequestNegotiationDtoSchema,
} from "../domain/wire";
import { CustodyDeposit, type DepositOrder } from "../ports/custody-deposit";
import { type LedgerRecord, type NegotiationRecord, NegotiationStore, type OpenRequestRecord } from "../ports/negotiation-store";

/** DI token: the clock every "today" and timestamp comes from, so expiry is testable. */
export const CLOCK = Symbol("CLOCK");
export type Clock = { now(): Date };

/** A negotiation as the deposit left it: with the wallet consent URL while an Open Payments deposit waits for the buyer. */
export type DepositOutcome = NegotiationRecord & { deposit_redirect_url?: string };
export type CatalogEntry = { project: Project; producerName: string; negotiationLocked: boolean; agreedMilestoneIds: string[] };

// Ported from the web app's mock (frontend/packages/shared/src/modules/presales/infrastructure/mock/mock-fetch.ts): same rules,
// same order of checks, same messages. Identity is the resolved user, never a body field: buyer_id / producer_id / names in a
// body are parsed (a missing one is still "malformed", like the mock) and ignored.
const MALFORMED = "La solicitud no tiene el formato esperado.";
const TURN_MESSAGE = "Es el turno de la otra parte.";
const EXPIRED_MESSAGE = "La oferta venció.";
const UNAVAILABLE_MESSAGE = "Esta acción ya no está disponible para la negociación.";
const NO_OFFERS_MESSAGE = "Esta negociación ya no admite ofertas.";
const BACKING_MESSAGES = {
  closed: "El proyecto elegido ya no admite ofertas.",
  not_owned: "El proyecto elegido no pertenece a este productor.",
} as const;
const START_MESSAGES: Record<StartBlock, string> = {
  own_project: "No puedes negociar sobre un proyecto propio.",
  project_status: "Este proyecto ya no admite nuevas negociaciones.",
  project_agreed: "Este proyecto ya tiene un acuerdo: no admite nuevas negociaciones.",
  milestone_status: "Este hito ya no admite nuevas negociaciones.",
  milestone_agreed: "Este hito ya tiene un acuerdo: no admite nuevas negociaciones.",
  duplicate: "Ya tienes una negociación activa para este proyecto o hito.",
};
const AGREE_MESSAGES: Record<AgreeBlock, string> = {
  project_status: "Este proyecto ya no admite acuerdos.",
  project_agreed: "El proyecto ya tiene un acuerdo: esta negociación se cerró.",
  milestone_status: "Este hito ya no admite acuerdos.",
  milestone_agreed: "Este hito ya tiene un acuerdo.",
};
const TOTAL_CHANGED_MESSAGE = "El total de la cotización del proyecto cambió. Revisa el nuevo monto antes de depositar.";
const NO_TOTAL_MESSAGE = "El proyecto no tiene hitos: no hay un total para depositar.";
const CONFIRM_TOTAL = { expectedTotal: ["Confirma el total del depósito."] };
const NO_DEPOSIT_MESSAGES = {
  not_project: "Solo los acuerdos del proyecto tienen depósito.",
  not_agreed: "Esta negociación no tiene un depósito pendiente.",
  already_deposited: "El depósito ya se realizó.",
  not_owner: "Solo el comprador de este acuerdo puede depositar.",
  project_status: "Este proyecto ya no admite depósitos.",
  no_total: NO_TOTAL_MESSAGE,
} as const;

const invalid = (errors: FieldErrors) => new ValidationError(errors, "Request rejected");
const malformed = () => invalid({ [FORM_LEVEL_KEY]: [MALFORMED] });
const conflict = (message: string) => new RejectedError(message);
const requestNotFound = () => new NotFoundError("Quote request not found");
const isParty = (value: string): value is "BUYER" | "PRODUCER" => value === "BUYER" || value === "PRODUCER";
/** Fidu and admin read every negotiation; nobody else reads one they are not a party to. */
const isStaff = (user: AuthenticatedUser) => user.role === "admin" || user.role === "fidu";
type Quote = SaleQuoteDto;
type MilestoneRow = { id: string; status: MilestoneStatus; suppliesBudget: number; laborBudget: number; sequenceOrder: number };

@Injectable()
export class NegotiationsService {
  constructor(
    private readonly store: NegotiationStore,
    private readonly milestones: MilestoneRepository,
    private readonly directory: UserDirectory,
    private readonly custody: CustodyDeposit,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private today = () => isoToday(this.clock.now());
  private stamp = () => this.clock.now().toISOString();

  // ---- shared reads ----

  private async project(id: string, store: NegotiationStore = this.store): Promise<Project> {
    const project = await store.findProject(id);
    if (!project) throw new NotFoundError("Project not found");
    return project;
  }

  /** The project's milestones with their derived status and budgets in whole pesos, in sequence order. */
  private async milestoneRows(project: Project): Promise<MilestoneRow[]> {
    const views = viewsOf(await this.milestones.findByProject(project.id), custodyGate(project));
    return views
      .map(toMilestoneSummaryResponse)
      .map((m) => ({ id: m.id, status: m.status, suppliesBudget: m.supplies_budget, laborBudget: m.labor_budget, sequenceOrder: m.sequence_order }))
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  }

  private async onProject(projectId: string, store: NegotiationStore) {
    return (await store.listNegotiations({ projectId })).map(toQuoteRequest);
  }

  /** The project quotation total for one buyer: agreed milestone prices where they exist, budgets elsewhere. */
  private async quotationTotalFor(project: Project, buyerId: string, store: NegotiationStore) {
    const prices = agreedMilestonePrices(await this.onProject(project.id, store), buyerId);
    return projectQuotationTotal(await this.milestoneRows(project), prices);
  }

  private append(request: NegotiationRecord, actor: string, type: string, from: string | null, to: string | null, payload?: Record<string, unknown>) {
    request.history.push({ id: `h-${randomUUID()}`, actor, type, from, to, at: this.stamp(), ...(payload ? { payload } : {}) });
  }

  private move(request: NegotiationRecord, action: string, actor: string, type: string, payload?: Record<string, unknown>) {
    const from = request.status;
    request.status = nextStatus(REQUEST_TRANSITIONS, from, action) ?? from;
    this.append(request, actor, type, from, request.status, payload);
  }

  private supersedeLive(request: NegotiationRecord) {
    for (const q of request.quotes) if (q.status === "SENT") q.status = nextStatus(QUOTE_TRANSITIONS, "SENT", "supersede") ?? q.status;
  }

  private async load(id: string, store: NegotiationStore = this.store) {
    const request = await store.findNegotiation(id);
    if (!request) throw requestNotFound();
    return request;
  }

  /** The party a body claims to act as must be the caller; anything else reads as not found, so ids never leak. */
  private assertActsAs(request: NegotiationRecord, actor: "BUYER" | "PRODUCER", user: AuthenticatedUser) {
    const id = actor === "BUYER" ? request.buyer_id : request.producer_id;
    if (id !== user.id) throw requestNotFound();
  }

  // ---- catalog ----

  async catalog(): Promise<CatalogEntry[]> {
    const projects = (await this.store.listProjects()).filter((p) => p.currentStatus !== PROJECT_STATUS.CANCELLED_OR_DISPUTED);
    return Promise.all(projects.map((p) => this.catalogEntry(p)));
  }

  async catalogProject(id: string): Promise<CatalogEntry> {
    const project = await this.store.findProject(id);
    if (!project || project.currentStatus === PROJECT_STATUS.CANCELLED_OR_DISPUTED) throw new NotFoundError("Project not found");
    return this.catalogEntry(project);
  }

  private async catalogEntry(project: Project): Promise<CatalogEntry> {
    const locks = catalogLocks(await this.onProject(project.id, this.store), project.id);
    const owner = await this.directory.findById(project.ownerUserId);
    return { project, producerName: owner?.name ?? "", ...locks };
  }

  // ---- project negotiations ----

  async start(projectId: string, buyer: AuthenticatedUser, body: unknown): Promise<NegotiationRecord> {
    return this.store.transaction(projectId, async (tx) => {
      const project = await this.project(projectId, tx);
      const dto = startNegotiationDtoSchema.safeParse(body);
      if (!dto.success) throw malformed();
      const input = dto.data;
      const now = this.today();

      const milestone = input.scope === "MILESTONE" ? (await this.milestoneRows(project)).find((m) => m.id === input.milestone_id) : undefined;
      if (input.scope === "MILESTONE" && !milestone) throw new NotFoundError("Milestone not found");

      const negotiations = await this.onProject(project.id, tx);
      const locks = catalogLocks(negotiations, project.id);
      const targetId = milestone ? milestone.id : project.id;
      const block = canStart({
        project,
        milestone: milestone ? { id: milestone.id, status: milestone.status } : null,
        negotiationLocked: locks.negotiationLocked,
        agreedMilestoneIds: locks.agreedMilestoneIds,
        ownerId: project.ownerUserId,
        starterId: buyer.id,
        hasLive: hasLiveNegotiation(negotiations, buyer.id, input.scope, targetId, now),
      });
      if (block) throw conflict(START_MESSAGES[block]);

      const created = this.stamp();
      const owner = await this.directory.findById(project.ownerUserId);
      const request: NegotiationRecord = {
        id: `qr-${randomUUID()}`,
        origin: "PROJECT_INTEREST",
        scope: input.scope,
        ...(milestone ? { milestone_id: milestone.id } : {}),
        project_id: project.id,
        producer_id: project.ownerUserId,
        producer_name: owner?.name ?? "",
        buyer_id: buyer.id,
        buyer_name: buyer.name,
        quantity: 1,
        desired_delivery_date: input.delivery_date,
        notes: input.notes ?? "",
        status: "QUOTED",
        created_at: created,
        quotes: [],
        history: [],
      };
      if (input.scope === "PROJECT") {
        const parsed = buildStartProjectNegotiationSchema(now).safeParse({
          quantity: input.quantity,
          unit: input.unit,
          unitPrice: input.unit_price,
          deliveryDate: input.delivery_date,
          validUntil: input.valid_until,
          notes: input.notes,
        });
        if (!parsed.success) throw invalid(toFieldErrors(parsed.error));
        request.quantity = parsed.data.quantity;
        request.notes = parsed.data.notes;
        request.quotes.push({
          request_id: request.id,
          revision: 1,
          author: "BUYER",
          unit_price: parsed.data.unitPrice,
          quantity: parsed.data.quantity,
          unit: parsed.data.unit,
          currency: "COP",
          delivery_date: parsed.data.deliveryDate,
          valid_until: parsed.data.validUntil,
          notes: parsed.data.notes,
          status: "SENT",
          created_at: created,
        });
      } else {
        const parsed = buildStartMilestoneNegotiationSchema(now).safeParse({ price: input.price, deliveryDate: input.delivery_date, notes: input.notes });
        if (!parsed.success) throw invalid(toFieldErrors(parsed.error));
        request.notes = parsed.data.notes;
        // Wire form of a lump-sum price: unit_price = price, quantity = 1, and no valid_until.
        request.quotes.push({
          request_id: request.id,
          revision: 1,
          author: "BUYER",
          unit_price: parsed.data.price,
          quantity: 1,
          currency: "COP",
          delivery_date: parsed.data.deliveryDate,
          notes: parsed.data.notes,
          status: "SENT",
          created_at: created,
        });
      }
      this.append(request, "BUYER", "OFFER", null, "QUOTED", offerPayload(request.quotes[0], input.scope));
      await tx.saveNegotiation(request);
      return request;
    });
  }

  async get(id: string, viewers: AuthenticatedUser[]): Promise<NegotiationRecord> {
    const request = await this.load(id);
    const visible = viewers.some((u) => isStaff(u) || u.id === request.buyer_id || u.id === request.producer_id);
    if (!visible) throw requestNotFound();
    return request;
  }

  /** A buyer reads only their own list; staff read anyone's. */
  async listForBuyer(buyerId: string, user: AuthenticatedUser) {
    if (buyerId !== user.id && !isStaff(user)) return [];
    return this.store.listNegotiations({ buyerId });
  }

  /** A producer always reads their own negotiations (the producer_id query is honored for staff only). */
  async listForProducer(user: AuthenticatedUser, projectId?: string, producerId?: string) {
    const producer = isStaff(user) ? producerId : user.id;
    return this.store.listNegotiations({ ...(projectId ? { projectId } : {}), ...(producer ? { producerId: producer } : {}) });
  }

  // ---- offers ----

  async counter(id: string, user: AuthenticatedUser, body: unknown): Promise<NegotiationRecord> {
    const found = await this.load(id);
    return this.store.transaction(found.project_id, async (tx) => {
      const request = await this.load(id, tx);
      const dto = respondRequestDtoSchema.safeParse(body ?? null);
      if (!dto.success) throw malformed();
      const author = dto.data.author ?? "PRODUCER";
      if (!isParty(author)) throw malformed();
      this.assertActsAs(request, author, user);
      const now = this.today();

      const asDomain = toQuoteRequest(request);
      const status = effectiveRequestStatus(asDomain, now);

      // Project negotiations (scope PROJECT / MILESTONE): every offer after the opening one is a counter.
      if (asDomain.scope === "PROJECT" || asDomain.scope === "MILESTONE") {
        if (!nextStatus(REQUEST_TRANSITIONS, status, "counter")) throw conflict(status === "EXPIRED" ? EXPIRED_MESSAGE : NO_OFFERS_MESSAGE);
        if (!canAct(asDomain, author, "counter", now)) throw conflict(TURN_MESSAGE);
        const project = await this.project(request.project_id, tx);
        const milestone = request.milestone_id ? (await this.milestoneRows(project)).find((m) => m.id === request.milestone_id) : undefined;
        const locks = catalogLocks(await this.onProject(project.id, tx), project.id);
        const agreeBlock = canAgree({
          scope: asDomain.scope,
          project,
          milestone: milestone ? { id: milestone.id, status: milestone.status } : null,
          negotiationLocked: locks.negotiationLocked,
          agreedMilestoneIds: locks.agreedMilestoneIds,
        });
        if (agreeBlock) throw conflict(AGREE_MESSAGES[agreeBlock]);

        const latestTerms: OfferTerms | undefined = latestQuote(asDomain)?.terms;
        const created = this.stamp();
        let quote: Quote;
        if (asDomain.scope === "PROJECT" && latestTerms?.kind === "PROJECT") {
          const parsed = buildProjectCounterSchema({ today: now, latest: latestTerms }).safeParse({
            quantity: dto.data.quantity,
            unit: dto.data.unit,
            unitPrice: dto.data.unit_price,
            deliveryDate: dto.data.delivery_date,
            validUntil: dto.data.valid_until,
            notes: dto.data.notes,
          });
          if (!parsed.success) throw invalid(toFieldErrors(parsed.error));
          request.quantity = parsed.data.quantity;
          quote = {
            request_id: request.id,
            revision: request.quotes.length + 1,
            author,
            unit_price: parsed.data.unitPrice,
            quantity: parsed.data.quantity,
            unit: parsed.data.unit,
            currency: "COP",
            delivery_date: parsed.data.deliveryDate,
            valid_until: parsed.data.validUntil,
            notes: parsed.data.notes,
            status: "SENT",
            created_at: created,
          };
        } else if (asDomain.scope === "MILESTONE" && latestTerms?.kind === "MILESTONE") {
          const parsed = buildMilestoneCounterSchema({ today: now, latest: latestTerms }).safeParse({
            price: dto.data.price,
            deliveryDate: dto.data.delivery_date,
            notes: dto.data.notes,
          });
          if (!parsed.success) throw invalid(toFieldErrors(parsed.error));
          quote = {
            request_id: request.id,
            revision: request.quotes.length + 1,
            author,
            unit_price: parsed.data.price,
            quantity: 1,
            currency: "COP",
            delivery_date: parsed.data.deliveryDate,
            notes: parsed.data.notes,
            status: "SENT",
            created_at: created,
          };
        } else {
          throw malformed();
        }
        this.supersedeLive(request);
        request.quotes.push(quote);
        this.move(request, "counter", author, "COUNTER_OFFER", offerPayload(quote, asDomain.scope));
        await tx.saveNegotiation(request);
        return request;
      }

      // Open-request negotiations: the producer opened with an offer, so every later offer is a counter.
      if (!nextStatus(REQUEST_TRANSITIONS, status, "counter")) throw conflict(status === "EXPIRED" ? EXPIRED_MESSAGE : NO_OFFERS_MESSAGE);
      if (!canAct(asDomain, author, "counter", now)) throw conflict(TURN_MESSAGE);

      const openRequest = request.open_request_id ? await tx.findOpenRequest(request.open_request_id) : null;
      const cap = quantityCap(openRequest ? remainingToAward(toOpenRequest(await this.withAwarded(openRequest, tx))) : Number.POSITIVE_INFINITY);
      const parsed = buildCounterOfferSchema({ cap, today: now }).safeParse({
        unitPrice: dto.data.unit_price,
        quantity: dto.data.quantity,
        validUntil: dto.data.valid_until,
        deliveryDate: dto.data.delivery_date,
        deliveryTerms: dto.data.delivery_terms,
      });
      if (!parsed.success) throw invalid(toFieldErrors(parsed.error));
      const terms = parsed.data;

      this.supersedeLive(request);
      const quote: Quote = {
        request_id: request.id,
        revision: request.quotes.length + 1,
        author,
        unit_price: terms.unitPrice,
        quantity: terms.quantity,
        currency: "COP",
        ...(terms.deliveryDate ? { delivery_date: terms.deliveryDate } : {}),
        valid_until: terms.validUntil,
        delivery_terms: terms.deliveryTerms,
        status: "SENT",
        created_at: this.stamp(),
      };
      request.quotes.push(quote);
      this.move(request, "counter", author, "COUNTER_OFFER", offerPayload(quote));
      await tx.saveNegotiation(request);
      return request;
    });
  }

  // ---- accepting or rejecting the latest offer ----

  async decide(id: string, revision: number, action: "accept" | "reject", user: AuthenticatedUser, body: unknown): Promise<DepositOutcome> {
    const found = await this.load(id);
    const decided = await this.store.transaction(found.project_id, async (tx) => {
      const request = await this.load(id, tx);
      const actor = readActor(body);
      if (!actor) throw malformed();
      this.assertActsAs(request, actor, user);
      const now = this.today();

      const asDomain = toQuoteRequest(request);
      const latest = latestQuote(asDomain);
      const quote = request.quotes.find((q) => q.revision === revision);
      if (!quote || !latest) throw new NotFoundError("Quote not found");
      if (latest.revision !== quote.revision) throw conflict("Esta oferta ya fue superada por una contraoferta.");
      if (effectiveQuoteStatus(latest, now) === "EXPIRED") throw conflict(EXPIRED_MESSAGE);
      if (!nextStatus(QUOTE_TRANSITIONS, quote.status, action) || !nextStatus(REQUEST_TRANSITIONS, effectiveRequestStatus(asDomain, now), action)) {
        throw conflict(UNAVAILABLE_MESSAGE);
      }
      if (!canAct(asDomain, actor, action, now)) throw conflict(TURN_MESSAGE);

      // Project negotiations: agreement (and, for the buyer on a PROJECT offer, the deposit) happen in this one step.
      if (action === "accept" && (asDomain.scope === "PROJECT" || asDomain.scope === "MILESTONE")) {
        const project = await this.project(request.project_id, tx);
        const milestone = request.milestone_id ? (await this.milestoneRows(project)).find((m) => m.id === request.milestone_id) : undefined;
        const negotiations = await this.onProject(project.id, tx);
        const locks = catalogLocks(negotiations, project.id);
        const agreeBlock = canAgree({
          scope: asDomain.scope,
          project,
          milestone: milestone ? { id: milestone.id, status: milestone.status } : null,
          negotiationLocked: locks.negotiationLocked,
          agreedMilestoneIds: locks.agreedMilestoneIds,
        });
        if (agreeBlock) throw conflict(AGREE_MESSAGES[agreeBlock]);

        // Every guard runs before anything is mutated, so a refusal leaves the whole state untouched.
        let total = 0;
        if (asDomain.scope === "PROJECT") {
          total = await this.quotationTotalFor(project, request.buyer_id, tx);
          if (total <= 0) throw conflict(NO_TOTAL_MESSAGE);
          const parsed = actorBodyDtoSchema.safeParse(body);
          const expected = parsed.success ? parsed.data.expected_total : undefined;
          if (actor === "BUYER" && expected === undefined) throw invalid(CONFIRM_TOTAL);
          if (expected !== undefined && expected !== total) throw conflict(TOTAL_CHANGED_MESSAGE);
        }

        quote.status = nextStatus(QUOTE_TRANSITIONS, quote.status, "accept") ?? quote.status;
        this.move(request, "accept", actor, "ACCEPT", { ...offerPayload(quote, asDomain.scope), ...(total > 0 ? { agreed_total: total } : {}) });
        if (asDomain.scope === "PROJECT") {
          request.agreed_total = total;
          request.deposit_status = "PENDING";
        }

        // The agreement closes every rival negotiation; open-request negotiations are never touched.
        for (const rivalId of autoCloseOthers(negotiations, toQuoteRequest(request), now)) {
          const rival = await tx.findNegotiation(rivalId);
          if (!rival) continue;
          for (const q of rival.quotes) if (q.status === "SENT") q.status = nextStatus(QUOTE_TRANSITIONS, "SENT", "auto_close") ?? q.status;
          this.move(rival, "auto_close", "SYSTEM", "AUTO_CLOSE", { reason: asDomain.scope, agreed_negotiation_id: request.id });
          await tx.saveNegotiation(rival);
        }
        await tx.saveNegotiation(request);
        return { request, depositNow: asDomain.scope === "PROJECT" && actor === "BUYER" };
      }

      if (action === "accept") {
        // Re-checked at accept time: other agreements may have taken the quantity since this offer was sent.
        const openRequest = request.open_request_id ? await tx.findOpenRequest(request.open_request_id) : null;
        if (openRequest) {
          const allocation = allocationGuard(toOpenRequest(await this.withAwarded(openRequest, tx)), quote.quantity);
          if (!allocation.ok) throw conflict(capMessage({ cap: allocation.remaining, reason: "remaining" }));
        }
      }

      quote.status = nextStatus(QUOTE_TRANSITIONS, quote.status, action) ?? quote.status;
      // Accepting records the agreement only: no order, payment or project change is created here.
      this.move(request, action, actor, action === "accept" ? "ACCEPT" : "REJECT", offerPayload(quote));
      await tx.saveNegotiation(request);
      return { request, depositNow: false };
    });
    // ponytail: the agreement commits first; if moving the money fails, the deposit stays PENDING and the deposit button retries it.
    return decided.depositNow ? this.moveDeposit(decided.request) : decided.request;
  }

  // ---- ending a negotiation without agreement ----

  async end(id: string, action: "cancel" | "decline" | "withdraw", user: AuthenticatedUser, body: unknown): Promise<NegotiationRecord> {
    const found = await this.load(id);
    return this.store.transaction(found.project_id, async (tx) => {
      const request = await this.load(id, tx);
      const actor = action === "cancel" ? "BUYER" : action === "decline" ? "PRODUCER" : readActor(body);
      if (!actor) throw malformed();
      this.assertActsAs(request, actor, user);
      const now = this.today();

      const asDomain = toQuoteRequest(request);
      if (effectiveRequestStatus(asDomain, now) === "EXPIRED") throw conflict(EXPIRED_MESSAGE);
      if (!canAct(asDomain, actor, action, now)) throw conflict(UNAVAILABLE_MESSAGE);
      // The live offer, if any, is closed with the negotiation.
      const live = request.quotes.find((q) => q.status === "SENT");
      if (live) live.status = "WITHDRAWN";
      this.move(request, action, actor, action === "decline" ? "REJECT" : "WITHDRAW");
      await tx.saveNegotiation(request);
      return request;
    });
  }

  // ---- custody deposit ----

  async deposit(id: string, buyer: AuthenticatedUser, body: unknown): Promise<DepositOutcome> {
    const request = await this.load(id);
    const dto = depositBodyDtoSchema.safeParse(body ?? null);
    if (!dto.success) throw malformed();
    const project = await this.project(request.project_id);

    const block = canDeposit(toQuoteRequest(request), "BUYER", buyer.id, project);
    if (block) throw conflict(NO_DEPOSIT_MESSAGES[block]);
    if (dto.data.expected_total === undefined) throw invalid(CONFIRM_TOTAL);
    if (dto.data.expected_total !== request.agreed_total) throw conflict(TOTAL_CHANGED_MESSAGE);
    return this.moveDeposit(request);
  }

  /** Moves the agreed total into custody: synchronously when simulated, else after the buyer approves the wallet grant. */
  private async moveDeposit(request: NegotiationRecord): Promise<DepositOutcome> {
    const started = await this.custody.start(await this.depositOrder(request));
    if (started) return { ...request, deposit_redirect_url: started.redirectUrl };
    return this.settleDeposit(request, null);
  }

  private async depositOrder(request: NegotiationRecord): Promise<DepositOrder> {
    const project = await this.project(request.project_id);
    return {
      negotiationId: request.id,
      projectId: project.id,
      amount: pesosToMinor(request.agreed_total ?? 0, project.assetScale),
      currency: project.currency,
      assetScale: project.assetScale,
    };
  }

  /** The wallet sent the buyer back: verify, move the money, then apply the custody effects. */
  async completeDeposit(id: string, callback: FundingCallback): Promise<NegotiationRecord> {
    const request = await this.load(id);
    if (request.deposit_status !== "PENDING") throw conflict(NO_DEPOSIT_MESSAGES.not_agreed);
    const { reference } = await this.custody.complete(await this.depositOrder(request), callback);
    return this.settleDeposit(request, reference);
  }

  // Ledger CREDIT, negotiation DEPOSITED and custody balance + FUNDED_IN_CUSTODY commit together. Idempotent: a settled deposit is left as is.
  private settleDeposit(found: NegotiationRecord, reference: string | null): Promise<NegotiationRecord> {
    return this.store.transaction(found.project_id, async (tx) => {
      const request = await this.load(found.id, tx);
      if (request.deposit_status !== "PENDING") return request;
      const project = await this.project(request.project_id, tx);
      const entry = applyProjectDeposit(request, { ledgerId: `led-${randomUUID()}`, historyId: `h-${randomUUID()}`, at: this.stamp() });
      await tx.saveNegotiation(request);
      await tx.addLedgerEntry({ ...entry, payment_reference: reference });
      await tx.creditCustody(project.id, pesosToMinor(entry.amount, project.assetScale));
      return request;
    });
  }

  /** The project's custody ledger: for its producer, the buyers negotiating on it, and staff. */
  async ledger(projectId: string, viewers: AuthenticatedUser[]): Promise<LedgerRecord[]> {
    const project = await this.project(projectId);
    const buyers = new Set((await this.store.listNegotiations({ projectId })).map((n) => n.buyer_id));
    const visible = viewers.some((u) => isStaff(u) || u.role === "investor" || u.id === project.ownerUserId || buyers.has(u.id));
    if (!visible) throw new NotFoundError("Project not found");
    return this.store.listLedger(projectId);
  }

  // ---- open requests ----

  /** Server-derived: what an open request has awarded, recomputed on every read. */
  async withAwarded(openRequest: OpenRequestRecord, store: NegotiationStore = this.store): Promise<OpenRequestDto> {
    const negotiations = await store.listNegotiations({ openRequestId: openRequest.id });
    const awarded = negotiations.flatMap((r) => r.quotes).filter((q) => q.status === "ACCEPTED").reduce((sum, q) => sum + q.quantity, 0);
    return { ...openRequest, awarded_quantity: awarded };
  }

  async listOpenRequests(status?: string) {
    return Promise.all((await this.store.listOpenRequests(status ? { status } : {})).map((o) => this.withAwarded(o)));
  }

  async listBuyerOpenRequests(buyerId: string, user: AuthenticatedUser) {
    if (buyerId !== user.id && !isStaff(user)) return [];
    return Promise.all((await this.store.listOpenRequests({ buyerId })).map((o) => this.withAwarded(o)));
  }

  private async openRequest(id: string) {
    const openRequest = await this.store.findOpenRequest(id);
    if (!openRequest) throw new NotFoundError("Open request not found");
    return openRequest;
  }

  async getOpenRequest(id: string) {
    return this.withAwarded(await this.openRequest(id));
  }

  async createOpenRequest(buyer: AuthenticatedUser, body: unknown): Promise<OpenRequestDto> {
    const dto = createOpenRequestDtoSchema.safeParse(body ?? null);
    if (!dto.success) throw malformed();
    const parsed = buildCreateOpenRequestSchema(this.today()).safeParse({
      title: dto.data.title,
      productionType: dto.data.production_type,
      quantity: dto.data.quantity,
      unit: dto.data.unit,
      targetUnitPrice: dto.data.target_unit_price,
      deliveryDate: dto.data.delivery_date,
      deliveryLocation: dto.data.delivery_location,
      notes: dto.data.notes,
    });
    if (!parsed.success) throw invalid(toFieldErrors(parsed.error));
    const openRequest: OpenRequestRecord = {
      id: `or-${randomUUID()}`,
      buyer_id: buyer.id,
      buyer_name: buyer.name,
      title: parsed.data.title,
      production_type: parsed.data.productionType,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      ...(parsed.data.targetUnitPrice !== undefined ? { target_unit_price: parsed.data.targetUnitPrice } : {}),
      currency: "COP",
      delivery_date: parsed.data.deliveryDate,
      delivery_location: parsed.data.deliveryLocation,
      notes: parsed.data.notes,
      status: "OPEN",
      created_at: this.stamp(),
    };
    await this.store.saveOpenRequest(openRequest);
    return this.withAwarded(openRequest);
  }

  async closeOpenRequest(id: string, buyer: AuthenticatedUser): Promise<OpenRequestDto> {
    const openRequest = await this.openRequest(id);
    if (openRequest.buyer_id !== buyer.id) throw new NotFoundError("Open request not found");
    const next = nextStatus(OPEN_REQUEST_TRANSITIONS, openRequest.status, "close");
    if (!next) throw conflict("La solicitud abierta ya está cerrada.");
    const closed = { ...openRequest, status: next };
    await this.store.saveOpenRequest(closed);
    return this.withAwarded(closed);
  }

  async openRequestNegotiations(id: string) {
    return this.store.listNegotiations({ openRequestId: id });
  }

  async startOnOpenRequest(id: string, producer: AuthenticatedUser, body: unknown): Promise<NegotiationRecord> {
    const openRequest = await this.openRequest(id);
    const dto = startOpenRequestNegotiationDtoSchema.safeParse(body ?? null);
    if (!dto.success) throw malformed();
    const now = this.today();

    const openDomain = toOpenRequest(await this.withAwarded(openRequest));
    if (openRequest.status === "CLOSED") throw conflict("Esta solicitud abierta está cerrada: no admite nuevas negociaciones.");
    if (!canStartOnOpenRequest(openDomain, now)) throw conflict("Esta solicitud abierta ya no admite nuevas negociaciones.");

    const existing = (await this.store.listNegotiations({ openRequestId: openRequest.id })).map(toQuoteRequest);
    if (hasActiveNegotiation(existing, producer.id, now)) throw conflict("Ya tienes una negociación activa en esta solicitud.");

    // The backing project must be one of this producer's own that is not closed or cancelled.
    const project = await this.store.findProject(dto.data.project_id);
    if (!project) throw invalid({ projectId: ["Selecciona el proyecto que respalda la oferta."] });
    const block = backingProjectBlock(project, project.ownerUserId === producer.id);
    if (block) throw conflict(BACKING_MESSAGES[block]);

    const parsed = buildStartOpenRequestNegotiationSchema({ remaining: remainingToAward(openDomain), today: now }).safeParse({
      projectId: dto.data.project_id,
      unitPrice: dto.data.unit_price,
      quantity: dto.data.quantity,
      validUntil: dto.data.valid_until,
      deliveryDate: dto.data.delivery_date,
      deliveryTerms: dto.data.delivery_terms,
    });
    if (!parsed.success) throw invalid(toFieldErrors(parsed.error));

    const created = this.stamp();
    const request: NegotiationRecord = {
      id: `qr-${randomUUID()}`,
      origin: "OPEN_REQUEST",
      open_request_id: openRequest.id,
      project_id: project.id,
      producer_id: producer.id,
      producer_name: producer.name,
      buyer_id: openRequest.buyer_id,
      buyer_name: openRequest.buyer_name,
      quantity: parsed.data.quantity,
      desired_delivery_date: openRequest.delivery_date,
      notes: "",
      status: "QUOTED",
      created_at: created,
      quotes: [],
      history: [],
    };
    const quote: Quote = {
      request_id: request.id,
      revision: 1,
      author: "PRODUCER",
      unit_price: parsed.data.unitPrice,
      quantity: parsed.data.quantity,
      currency: "COP",
      ...(parsed.data.deliveryDate ? { delivery_date: parsed.data.deliveryDate } : {}),
      valid_until: parsed.data.validUntil,
      delivery_terms: parsed.data.deliveryTerms,
      status: "SENT",
      created_at: created,
    };
    request.quotes.push(quote);
    this.append(request, "PRODUCER", "OFFER", null, "QUOTED", offerPayload(quote));
    // ponytail: no lock across producers here; two offers racing past the remaining quantity are caught again at accept.
    await this.store.saveNegotiation(request);
    return request;
  }
}

/** History payload of an offer; a milestone offer is a lump-sum price, surfaced under its own key for the timeline. */
const offerPayload = (q: { revision: number; unit_price: number; quantity: number }, scope?: string | null) => ({
  revision: q.revision,
  unit_price: q.unit_price,
  quantity: q.quantity,
  total: saleQuoteTotal(q.quantity, q.unit_price),
  ...(scope === "MILESTONE" ? { price: q.unit_price } : {}),
});

/** Optional `{actor}` body of accept / reject / withdraw. Missing body means BUYER, as before negotiation existed. */
export function readActor(body: unknown): "BUYER" | "PRODUCER" | null {
  if (body === undefined || body === null) return "BUYER";
  const parsed = actorBodyDtoSchema.safeParse(body);
  if (!parsed.success) return null;
  const actor = parsed.data.actor ?? "BUYER";
  return isParty(actor) ? actor : null;
}
