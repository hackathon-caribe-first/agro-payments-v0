import { FORM_LEVEL_KEY, type FieldErrors } from "../../../milestones/domain/errors";
import { toFieldErrors } from "../../../milestones/schemas/evidence-log";
import type { RejectionBody } from "../../../projects/infrastructure/dto";
import { projectQuotationTotal } from "../../../projects/domain/project-rules";
import type { Actor, OfferTerms } from "../../domain/presale";
import {
  agreedMilestonePrices,
  autoCloseOthers,
  canAgree,
  canAuthorizePayment,
  canStart,
  catalogLocks,
  hasLiveNegotiation,
  type AgreeBlock,
  type StartBlock,
} from "../../domain/negotiation-rules";
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
} from "../../domain/presale-rules";
import {
  OPEN_REQUEST_TRANSITIONS,
  QUOTE_TRANSITIONS,
  REQUEST_TRANSITIONS,
  nextStatus,
} from "../../domain/transitions";
import { buildCounterOfferSchema, capMessage } from "../../schemas/counter-offer";
import { buildCreateOpenRequestSchema } from "../../schemas/create-open-request";
import { buildStartMilestoneNegotiationSchema, buildMilestoneCounterSchema } from "../../schemas/start-milestone-negotiation";
import { buildStartOpenRequestNegotiationSchema } from "../../schemas/start-open-request-negotiation";
import { buildProjectCounterSchema, buildStartProjectNegotiationSchema } from "../../schemas/start-project-negotiation";
import {
  actorBodyDtoSchema,
  createOpenRequestDtoSchema,
  authorizePaymentBodyDtoSchema,
  respondRequestDtoSchema,
  startNegotiationDtoSchema,
  startOpenRequestNegotiationDtoSchema,
  type CatalogProjectDto,
  type OpenRequestDto,
  type QuoteRequestDto,
} from "../dto";
import { toOpenRequest, toQuoteRequest } from "../mapper";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import { applyProjectPaymentAuthorization } from "./authorize-payment";
import { LOCAL_PRODUCER, projectOwner } from "./fixtures";
import type { PresalesMockStore } from "./store";

type RejectionErrors = RejectionBody["errors"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Both failure kinds use the same body shape: { error, errors: { path: [messages] } }.
const reject = (status: 400 | 409, errors: RejectionErrors) => json({ error: "Request rejected", errors }, status);
const invalid = (errors: FieldErrors) => reject(400, errors);
const conflict = (message: string) => reject(409, { [FORM_LEVEL_KEY]: [message] });
const malformed = () => invalid({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] });

const TURN_MESSAGE = "Es el turno de la otra parte.";
const EXPIRED_MESSAGE = "La oferta venció.";
const UNAVAILABLE_MESSAGE = "Esta acción ya no está disponible para la negociación.";

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
const TOTAL_CHANGED_MESSAGE = "El total del proyecto cambió: vuelve a revisarlo antes de autorizar.";
const NO_TOTAL_MESSAGE = "No hay un total para autorizar.";
const NO_AUTHORIZATION_MESSAGES = {
  not_project: "Solo los acuerdos del proyecto tienen autorización de pago.",
  not_agreed: "Esta negociación no tiene una autorización de pago pendiente.",
  already_authorized: "Ya existe una autorización de pago para este acuerdo.",
  not_owner: "Solo el comprador de este acuerdo puede autorizar el pago.",
  project_status: "Este proyecto ya no admite autorizaciones de pago.",
  no_total: NO_TOTAL_MESSAGE,
} as const;

const isParty = (value: string): value is "BUYER" | "PRODUCER" => value === "BUYER" || value === "PRODUCER";

interface Options {
  today?: () => string;
}

// Negotiation, catalog and open-request routes only. Paths are anchored so this handler never shadows GET /projects/:id
// (under /projects it owns POST /projects/:id/negotiations and the ext-* external projects, and nothing else).
export function createPresalesMockFetch(store: PresalesMockStore, delegate: typeof fetch, { today = isoToday }: Options = {}): typeof fetch {
  let nextRequest = store.quoteRequests.length + 1;
  let nextOpenRequest = store.openRequests.length + 1;
  let nextHistory = store.quoteRequests.reduce((n, r) => n + r.history.length, 0) + 1;

  const acceptedQuantity = (requests: QuoteRequestDto[]) =>
    requests.flatMap((r) => r.quotes).filter((q) => q.status === "ACCEPTED").reduce((sum, q) => sum + q.quantity, 0);

  // Server-derived: what an open request has awarded, recomputed on every read.
  const awardedFor = (openRequestId: string) => acceptedQuantity(store.quoteRequests.filter((r) => r.open_request_id === openRequestId));

  const serializeOpenRequest = (o: OpenRequestDto): OpenRequestDto => ({ ...o, awarded_quantity: awardedFor(o.id) });
  const findRequest = (id: string) => store.quoteRequests.find((r) => r.id === id);
  const findOpenRequest = (id: string) => store.openRequests.find((o) => o.id === id);
  const domainOpenRequest = (o: OpenRequestDto) => toOpenRequest(serializeOpenRequest(o));

  let nextAuthorization = store.paymentAuthorizations.length + 1;
  const allProjects = (): ProjectDto[] => [...store.projects, ...store.externalProjects];
  const findProject = (id: string) => allProjects().find((p) => p.id === id);
  const milestonesOf = (projectId: string) =>
    store.milestones.filter((m) => m.project_id === projectId).sort((a, b) => a.sequence_order - b.sequence_order);
  const domainNegotiations = () => store.quoteRequests.map(toQuoteRequest);

  // Catalog entry: the project, its producer and the server-derived locks (so a buyer never reads others' negotiations).
  function serializeCatalog(project: ProjectDto): CatalogProjectDto {
    const owner = projectOwner(project.id);
    const locks = catalogLocks(domainNegotiations(), project.id);
    return {
      ...project,
      producer_id: owner.id,
      producer_name: owner.name,
      negotiation_locked: locks.negotiationLocked,
      agreed_milestone_ids: locks.agreedMilestoneIds,
    };
  }

  // The project quotation total for one buyer: agreed milestone prices where they exist, budgets elsewhere.
  function quotationTotalFor(projectId: string, buyerId: string): number {
    const prices = agreedMilestonePrices(domainNegotiations(), buyerId);
    const milestones = milestonesOf(projectId).map((m) => ({ id: m.id, suppliesBudget: m.supplies_budget, laborBudget: m.labor_budget }));
    return projectQuotationTotal(milestones, prices);
  }

  function appendHistory(request: QuoteRequestDto, actor: string, type: string, from: string | null, to: string | null, payload?: Record<string, unknown>) {
    request.history.push({
      id: `h-${nextHistory++}`,
      actor,
      type,
      from,
      to,
      at: new Date().toISOString(),
      ...(payload ? { payload } : {}),
    });
  }

  const offerPayload = (q: { revision: number; unit_price: number; quantity: number }, scope?: string | null) => ({
    revision: q.revision,
    unit_price: q.unit_price,
    quantity: q.quantity,
    total: saleQuoteTotal(q.quantity, q.unit_price),
    // A milestone offer is a lump-sum price: surface it under its own key for the timeline.
    ...(scope === "MILESTONE" ? { price: q.unit_price } : {}),
  });

  // Moves the request along its transition table and records the event.
  function move(request: QuoteRequestDto, action: string, actor: string, type: string, payload?: Record<string, unknown>) {
    const from = request.status;
    request.status = nextStatus(REQUEST_TRANSITIONS, from, action) ?? from;
    appendHistory(request, actor, type, from, request.status, payload);
  }

  // Ends a negotiation without agreement: the live offer, if any, is closed with it.
  function endWithout(request: QuoteRequestDto, action: "cancel" | "decline" | "withdraw", actor: string) {
    const live = request.quotes.find((q) => q.status === "SENT");
    if (live) live.status = "WITHDRAWN";
    move(request, action, actor, action === "decline" ? "REJECT" : "WITHDRAW");
  }

  const readBody = (init?: RequestInit): unknown => {
    try {
      return JSON.parse(String(init?.body ?? "null"));
    } catch {
      return undefined;
    }
  };

  // Optional `{actor}` body of accept / reject / withdraw. Missing body means BUYER, as before negotiation existed.
  const readActor = (init?: RequestInit): Actor | null => {
    if (init?.body === undefined || init.body === null) return "BUYER";
    const parsed = actorBodyDtoSchema.safeParse(readBody(init));
    if (!parsed.success) return null;
    const actor = parsed.data.actor ?? "BUYER";
    return isParty(actor) ? actor : null;
  };

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");
    const now = today();

    // --- external projects (other producers), by id only ---
    const external = path.match(/^\/projects\/(ext-[^/]+)$/);
    if (method === "GET" && external) {
      const project = store.externalProjects.find((p) => p.id === external[1]);
      return project ? json(project) : json({ error: "Project not found" }, 404);
    }

    // --- catalog: every project that is not cancelled, derived from projects + milestones ---
    if (method === "GET" && path === "/catalog/projects") {
      return json(allProjects().filter((p) => p.current_status !== "CANCELLED_OR_DISPUTED").map(serializeCatalog));
    }
    const catalogMatch = path.match(/^\/catalog\/projects\/([^/]+)$/);
    if (method === "GET" && catalogMatch) {
      const project = findProject(catalogMatch[1]);
      return project && project.current_status !== "CANCELLED_OR_DISPUTED" ? json(serializeCatalog(project)) : json({ error: "Project not found" }, 404);
    }

    // --- the buyer opens a negotiation on a project or on one of its milestones ---
    const startProject = path.match(/^\/projects\/([^/]+)\/negotiations$/);
    if (method === "POST" && startProject) {
      const project = findProject(startProject[1]);
      if (!project) return json({ error: "Project not found" }, 404);
      const dto = startNegotiationDtoSchema.safeParse(readBody(init));
      if (!dto.success) return malformed();
      const body = dto.data;

      const milestone = body.scope === "MILESTONE" ? milestonesOf(project.id).find((m) => m.id === body.milestone_id) : undefined;
      if (body.scope === "MILESTONE" && !milestone) return json({ error: "Milestone not found" }, 404);

      const owner = projectOwner(project.id);
      const locks = catalogLocks(domainNegotiations(), project.id);
      const targetId = milestone ? milestone.id : project.id;
      const block = canStart({
        project: { currentStatus: project.current_status },
        milestone: milestone ? { id: milestone.id, status: milestone.status } : null,
        negotiationLocked: locks.negotiationLocked,
        agreedMilestoneIds: locks.agreedMilestoneIds,
        ownerId: owner.id,
        starterId: body.buyer_id,
        hasLive: hasLiveNegotiation(domainNegotiations(), body.buyer_id, body.scope, targetId, now),
      });
      if (block) return conflict(START_MESSAGES[block]);

      const created = new Date().toISOString();
      const request: QuoteRequestDto = {
        id: `qr-${nextRequest++}`,
        origin: "PROJECT_INTEREST",
        scope: body.scope,
        ...(milestone ? { milestone_id: milestone.id } : {}),
        project_id: project.id,
        producer_id: owner.id,
        producer_name: owner.name,
        buyer_id: body.buyer_id,
        buyer_name: body.buyer_name,
        quantity: 1,
        desired_delivery_date: body.delivery_date,
        notes: body.notes ?? "",
        status: "QUOTED",
        created_at: created,
        quotes: [],
        history: [],
      };
      if (body.scope === "PROJECT") {
        const parsed = buildStartProjectNegotiationSchema(now).safeParse({
          quantity: body.quantity,
          unit: body.unit,
          unitPrice: body.unit_price,
          deliveryDate: body.delivery_date,
          validUntil: body.valid_until,
          notes: body.notes,
        });
        if (!parsed.success) return invalid(toFieldErrors(parsed.error));
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
        const parsed = buildStartMilestoneNegotiationSchema(now).safeParse({ price: body.price, deliveryDate: body.delivery_date, notes: body.notes });
        if (!parsed.success) return invalid(toFieldErrors(parsed.error));
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
      appendHistory(request, "BUYER", "OFFER", null, "QUOTED", offerPayload(request.quotes[0], body.scope));
      store.quoteRequests.push(request);
      return json(request, 201);
    }

    // --- executing the pending payment authorization of an agreed PROJECT negotiation ---
    const authorizeMatch = path.match(/^\/negotiations\/([^/]+)\/payment-authorization$/);
    if (method === "POST" && authorizeMatch) {
      const request = findRequest(authorizeMatch[1]);
      if (!request) return json({ error: "Negotiation not found" }, 404);
      const dto = authorizePaymentBodyDtoSchema.safeParse(readBody(init));
      if (!dto.success) return malformed();
      const project = findProject(request.project_id);
      if (!project) return json({ error: "Project not found" }, 404);

      const asDomain = toQuoteRequest(request);
      const block = canAuthorizePayment(asDomain, "BUYER", dto.data.buyer_id, { currentStatus: project.current_status });
      if (block) return conflict(NO_AUTHORIZATION_MESSAGES[block]);
      if (dto.data.expected_total === undefined) return invalid({ expectedTotal: ["Confirma el total a autorizar."] });
      if (dto.data.expected_total !== request.agreed_total) return conflict(TOTAL_CHANGED_MESSAGE);

      applyProjectPaymentAuthorization(store, request, { authorizationId: `pay-auth-${nextAuthorization++}`, historyId: `h-${nextHistory++}`, at: new Date().toISOString() });
      return json(request);
    }

    if (method === "GET" && path === "/producer/quote-requests") {
      const projectId = url.searchParams.get("project_id");
      const producerId = url.searchParams.get("producer_id");
      // A request without a producer predates producers: it belongs to the local one.
      return json(
        store.quoteRequests.filter(
          (r) => (!projectId || r.project_id === projectId) && (!producerId || (r.producer_id ?? LOCAL_PRODUCER.id) === producerId),
        ),
      );
    }

    const buyerRequests = path.match(/^\/buyers\/([^/]+)\/quote-requests$/);
    if (method === "GET" && buyerRequests) {
      return json(store.quoteRequests.filter((r) => r.buyer_id === buyerRequests[1]));
    }

    const requestMatch = path.match(/^\/quote-requests\/([^/]+)$/);
    if (method === "GET" && requestMatch) {
      const request = findRequest(requestMatch[1]);
      return request ? json(request) : json({ error: "Quote request not found" }, 404);
    }

    // --- ending a negotiation without agreement ---
    const endMatch = path.match(/^\/quote-requests\/([^/]+)\/(cancel|decline|withdraw)$/);
    if (method === "POST" && endMatch) {
      const request = findRequest(endMatch[1]);
      if (!request) return json({ error: "Quote request not found" }, 404);
      const action = endMatch[2] as "cancel" | "decline" | "withdraw";
      const actor = action === "cancel" ? "BUYER" : action === "decline" ? "PRODUCER" : readActor(init);
      if (!actor) return malformed();

      const asDomain = toQuoteRequest(request);
      if (effectiveRequestStatus(asDomain, now) === "EXPIRED") return conflict(EXPIRED_MESSAGE);
      if (!canAct(asDomain, actor, action, now)) return conflict(UNAVAILABLE_MESSAGE);
      endWithout(request, action, actor);
      return json(request);
    }

    // --- offers: the producer's first response and every counter-offer ---
    const offerMatch = path.match(/^\/quote-requests\/([^/]+)\/quotes$/);
    if (method === "POST" && offerMatch) {
      const request = findRequest(offerMatch[1]);
      if (!request) return json({ error: "Quote request not found" }, 404);
      const dto = respondRequestDtoSchema.safeParse(readBody(init));
      if (!dto.success) return malformed();
      const author = dto.data.author ?? "PRODUCER";
      if (!isParty(author)) return malformed();

      const asDomain = toQuoteRequest(request);
      const status = effectiveRequestStatus(asDomain, now);

      // Project negotiations (scope PROJECT / MILESTONE): every offer after the opening one is a counter.
      if (asDomain.scope === "PROJECT" || asDomain.scope === "MILESTONE") {
        if (!nextStatus(REQUEST_TRANSITIONS, status, "counter")) {
          return conflict(status === "EXPIRED" ? EXPIRED_MESSAGE : "Esta negociación ya no admite ofertas.");
        }
        if (!canAct(asDomain, author, "counter", now)) return conflict(TURN_MESSAGE);
        const project = findProject(request.project_id);
        if (!project) return json({ error: "Project not found" }, 404);
        const milestone = request.milestone_id ? milestonesOf(project.id).find((m) => m.id === request.milestone_id) : undefined;
        const locks = catalogLocks(domainNegotiations(), project.id);
        const agreeBlock = canAgree({
          scope: asDomain.scope,
          project: { currentStatus: project.current_status },
          milestone: milestone ? { id: milestone.id, status: milestone.status } : null,
          negotiationLocked: locks.negotiationLocked,
          agreedMilestoneIds: locks.agreedMilestoneIds,
        });
        if (agreeBlock) return conflict(AGREE_MESSAGES[agreeBlock]);

        const latest = latestQuote(asDomain);
        const latestTerms: OfferTerms | undefined = latest?.terms;
        const created = new Date().toISOString();
        let quote: QuoteRequestDto["quotes"][number];
        if (asDomain.scope === "PROJECT" && latestTerms?.kind === "PROJECT") {
          const parsed = buildProjectCounterSchema({ today: now, latest: latestTerms }).safeParse({
            quantity: dto.data.quantity,
            unit: dto.data.unit,
            unitPrice: dto.data.unit_price,
            deliveryDate: dto.data.delivery_date,
            validUntil: dto.data.valid_until,
            notes: dto.data.notes,
          });
          if (!parsed.success) return invalid(toFieldErrors(parsed.error));
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
          if (!parsed.success) return invalid(toFieldErrors(parsed.error));
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
          return malformed();
        }
        for (const q of request.quotes) if (q.status === "SENT") q.status = nextStatus(QUOTE_TRANSITIONS, "SENT", "supersede") ?? q.status;
        request.quotes.push(quote);
        move(request, "counter", author, "COUNTER_OFFER", offerPayload(quote, asDomain.scope));
        return json(request, 201);
      }

      // Open-request negotiations: the producer opened with an offer, so every later offer is a counter.
      if (!nextStatus(REQUEST_TRANSITIONS, status, "counter")) {
        return conflict(status === "EXPIRED" ? EXPIRED_MESSAGE : "Esta negociación ya no admite ofertas.");
      }
      if (!canAct(asDomain, author, "counter", now)) return conflict(TURN_MESSAGE);

      // Only what is still to be awarded caps the quantity: there is no stock concept any more.
      const openRequest = request.open_request_id ? findOpenRequest(request.open_request_id) : undefined;
      const cap = quantityCap(openRequest ? remainingToAward(domainOpenRequest(openRequest)) : Number.POSITIVE_INFINITY);
      const parsed = buildCounterOfferSchema({ cap, today: now }).safeParse({
        unitPrice: dto.data.unit_price,
        quantity: dto.data.quantity,
        validUntil: dto.data.valid_until,
        deliveryDate: dto.data.delivery_date,
        deliveryTerms: dto.data.delivery_terms,
      });
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));
      const terms = parsed.data;

      // The new offer is the only one left SENT.
      for (const q of request.quotes) if (q.status === "SENT") q.status = nextStatus(QUOTE_TRANSITIONS, "SENT", "supersede") ?? q.status;
      const quote = {
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
        created_at: new Date().toISOString(),
      };
      request.quotes.push(quote);
      move(request, "counter", author, "COUNTER_OFFER", offerPayload(quote));
      return json(request, 201);
    }

    // --- accepting or rejecting the latest offer ---
    const decide = path.match(/^\/quote-requests\/([^/]+)\/quotes\/(\d+)\/(accept|reject)$/);
    if (method === "POST" && decide) {
      const request = findRequest(decide[1]);
      if (!request) return json({ error: "Quote request not found" }, 404);
      const action = decide[3] as "accept" | "reject";
      const actor = readActor(init);
      if (!actor) return malformed();

      const asDomain = toQuoteRequest(request);
      const latest = latestQuote(asDomain);
      const quote = request.quotes.find((q) => q.revision === Number(decide[2]));
      if (!quote || !latest) return json({ error: "Quote not found" }, 404);
      if (latest.revision !== quote.revision) return conflict("Esta oferta ya fue superada por una contraoferta.");
      if (effectiveQuoteStatus(latest, now) === "EXPIRED") return conflict(EXPIRED_MESSAGE);
      if (!nextStatus(QUOTE_TRANSITIONS, quote.status, action) || !nextStatus(REQUEST_TRANSITIONS, effectiveRequestStatus(asDomain, now), action)) {
        return conflict(UNAVAILABLE_MESSAGE);
      }
      if (!canAct(asDomain, actor, action, now)) return conflict(TURN_MESSAGE);

      // Project negotiations: agreement (and, for the buyer on a PROJECT offer, the payment authorization) happen in this one step.
      if (action === "accept" && (asDomain.scope === "PROJECT" || asDomain.scope === "MILESTONE")) {
        const project = findProject(request.project_id);
        if (!project) return json({ error: "Project not found" }, 404);
        const milestone = request.milestone_id ? milestonesOf(project.id).find((m) => m.id === request.milestone_id) : undefined;
        const locks = catalogLocks(domainNegotiations(), project.id);
        const agreeBlock = canAgree({
          scope: asDomain.scope,
          project: { currentStatus: project.current_status },
          milestone: milestone ? { id: milestone.id, status: milestone.status } : null,
          negotiationLocked: locks.negotiationLocked,
          agreedMilestoneIds: locks.agreedMilestoneIds,
        });
        if (agreeBlock) return conflict(AGREE_MESSAGES[agreeBlock]);

        // Every guard runs before anything is mutated, so a refusal leaves the whole state untouched.
        let total = 0;
        if (asDomain.scope === "PROJECT") {
          total = quotationTotalFor(project.id, request.buyer_id);
          if (total <= 0) return conflict(NO_TOTAL_MESSAGE);
          const body = actorBodyDtoSchema.safeParse(readBody(init));
          const expected = body.success ? body.data.expected_total : undefined;
          if (actor === "BUYER" && expected === undefined) return invalid({ expectedTotal: ["Confirma el total a autorizar."] });
          if (expected !== undefined && expected !== total) return conflict(TOTAL_CHANGED_MESSAGE);
        }

        quote.status = nextStatus(QUOTE_TRANSITIONS, quote.status, "accept") ?? quote.status;
        move(request, "accept", actor, "ACCEPT", { ...offerPayload(quote, asDomain.scope), ...(total > 0 ? { agreed_total: total } : {}) });
        if (asDomain.scope === "PROJECT") {
          request.agreed_total = total;
          request.authorization_status = "PENDING";
        }

        // The agreement closes every rival negotiation; open-request negotiations are never touched.
        const closing = autoCloseOthers(domainNegotiations(), toQuoteRequest(request), now);
        for (const id of closing) {
          const rival = findRequest(id);
          if (!rival) continue;
          for (const q of rival.quotes) if (q.status === "SENT") q.status = nextStatus(QUOTE_TRANSITIONS, "SENT", "auto_close") ?? q.status;
          move(rival, "auto_close", "SYSTEM", "AUTO_CLOSE", { reason: asDomain.scope, agreed_negotiation_id: request.id });
        }

        if (asDomain.scope === "PROJECT" && actor === "BUYER") {
          applyProjectPaymentAuthorization(store, request, { authorizationId: `pay-auth-${nextAuthorization++}`, historyId: `h-${nextHistory++}`, at: new Date().toISOString() });
        }
        return json(request);
      }

      if (action === "accept") {
        // Re-checked at accept time: other agreements may have taken the quantity since this offer was sent.
        const openRequest = request.open_request_id ? findOpenRequest(request.open_request_id) : undefined;
        if (openRequest) {
          const allocation = allocationGuard(domainOpenRequest(openRequest), quote.quantity);
          if (!allocation.ok) return conflict(capMessage({ cap: allocation.remaining, reason: "remaining" }));
        }
      }

      quote.status = nextStatus(QUOTE_TRANSITIONS, quote.status, action) ?? quote.status;
      // Accepting records the agreement only: no order, payment or project change is created here.
      move(request, action, actor, action === "accept" ? "ACCEPT" : "REJECT", offerPayload(quote));
      return json(request);
    }

    // --- open requests ---
    if (method === "GET" && path === "/open-requests") {
      const status = url.searchParams.get("status");
      return json(store.openRequests.filter((o) => !status || o.status === status).map(serializeOpenRequest));
    }

    if (method === "POST" && path === "/open-requests") {
      const dto = createOpenRequestDtoSchema.safeParse(readBody(init));
      if (!dto.success) return malformed();
      const parsed = buildCreateOpenRequestSchema(now).safeParse({
        title: dto.data.title,
        productionType: dto.data.production_type,
        quantity: dto.data.quantity,
        unit: dto.data.unit,
        targetUnitPrice: dto.data.target_unit_price,
        deliveryDate: dto.data.delivery_date,
        deliveryLocation: dto.data.delivery_location,
        notes: dto.data.notes,
      });
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));

      const openRequest: OpenRequestDto = {
        id: `or-${nextOpenRequest++}`,
        buyer_id: dto.data.buyer_id,
        buyer_name: dto.data.buyer_name,
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
        created_at: new Date().toISOString(),
      };
      store.openRequests.push(openRequest);
      return json(serializeOpenRequest(openRequest), 201);
    }

    const buyerOpenRequests = path.match(/^\/buyers\/([^/]+)\/open-requests$/);
    if (method === "GET" && buyerOpenRequests) {
      return json(store.openRequests.filter((o) => o.buyer_id === buyerOpenRequests[1]).map(serializeOpenRequest));
    }

    const openRequestMatch = path.match(/^\/open-requests\/([^/]+)$/);
    if (method === "GET" && openRequestMatch) {
      const openRequest = findOpenRequest(openRequestMatch[1]);
      return openRequest ? json(serializeOpenRequest(openRequest)) : json({ error: "Open request not found" }, 404);
    }

    const closeOpenRequest = path.match(/^\/open-requests\/([^/]+)\/close$/);
    if (method === "POST" && closeOpenRequest) {
      const openRequest = findOpenRequest(closeOpenRequest[1]);
      if (!openRequest) return json({ error: "Open request not found" }, 404);
      const next = nextStatus(OPEN_REQUEST_TRANSITIONS, openRequest.status, "close");
      if (!next) return conflict("La solicitud abierta ya está cerrada.");
      openRequest.status = next;
      return json(serializeOpenRequest(openRequest));
    }

    const openNegotiations = path.match(/^\/open-requests\/([^/]+)\/negotiations$/);
    if (method === "GET" && openNegotiations) {
      return json(store.quoteRequests.filter((r) => r.open_request_id === openNegotiations[1]));
    }
    if (method === "POST" && openNegotiations) {
      const openRequest = findOpenRequest(openNegotiations[1]);
      if (!openRequest) return json({ error: "Open request not found" }, 404);
      const dto = startOpenRequestNegotiationDtoSchema.safeParse(readBody(init));
      if (!dto.success) return malformed();

      const openDomain = domainOpenRequest(openRequest);
      if (openRequest.status === "CLOSED") return conflict("Esta solicitud abierta está cerrada: no admite nuevas negociaciones.");
      if (!canStartOnOpenRequest(openDomain, now)) return conflict("Esta solicitud abierta ya no admite nuevas negociaciones.");

      const existing = store.quoteRequests.filter((r) => r.open_request_id === openRequest.id).map(toQuoteRequest);
      if (hasActiveNegotiation(existing, dto.data.producer_id, now)) return conflict("Ya tienes una negociación activa en esta solicitud.");

      // The backing project must be one of this producer's own that is not closed or cancelled.
      const project = findProject(dto.data.project_id);
      if (!project) return invalid({ projectId: ["Selecciona el proyecto que respalda la oferta."] });
      const block = backingProjectBlock({ currentStatus: project.current_status }, projectOwner(project.id).id === dto.data.producer_id);
      if (block) return conflict(BACKING_MESSAGES[block]);

      const parsed = buildStartOpenRequestNegotiationSchema({ remaining: remainingToAward(openDomain), today: now }).safeParse({
        projectId: dto.data.project_id,
        unitPrice: dto.data.unit_price,
        quantity: dto.data.quantity,
        validUntil: dto.data.valid_until,
        deliveryDate: dto.data.delivery_date,
        deliveryTerms: dto.data.delivery_terms,
      });
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));

      const request: QuoteRequestDto = {
        id: `qr-${nextRequest++}`,
        origin: "OPEN_REQUEST",
        open_request_id: openRequest.id,
        project_id: project.id,
        producer_id: dto.data.producer_id,
        producer_name: dto.data.producer_name,
        buyer_id: openRequest.buyer_id,
        buyer_name: openRequest.buyer_name,
        quantity: parsed.data.quantity,
        desired_delivery_date: openRequest.delivery_date,
        notes: "",
        status: "QUOTED",
        created_at: new Date().toISOString(),
        quotes: [],
        history: [],
      };
      const quote = {
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
        created_at: new Date().toISOString(),
      };
      request.quotes.push(quote);
      appendHistory(request, "PRODUCER", "OFFER", null, "QUOTED", offerPayload(quote));
      store.quoteRequests.push(request);
      return json(request, 201);
    }

    return delegate(input, init);
  };
}
