import { FORM_LEVEL_KEY, type FieldErrors } from "../../../milestones/domain/errors";
import { toFieldErrors } from "../../../milestones/schemas/evidence-log";
import type { RejectionBody } from "../../../projects/infrastructure/dto";
import type { Actor } from "../../domain/presale";
import {
  allocationGuard,
  availableQuantity,
  backingListingBlock,
  canAct,
  canStartOnOpenRequest,
  effectiveQuoteStatus,
  effectiveRequestStatus,
  hasActiveNegotiation,
  isoToday,
  latestQuote,
  offerCap,
  oversellGuard,
  publishBlock,
  remainingToAward,
  saleQuoteTotal,
} from "../../domain/presale-rules";
import {
  LISTING_TRANSITIONS,
  OPEN_REQUEST_TRANSITIONS,
  QUOTE_TRANSITIONS,
  REQUEST_TRANSITIONS,
  nextStatus,
} from "../../domain/transitions";
import { buildCounterOfferSchema, capMessage } from "../../schemas/counter-offer";
import { buildCreateOpenRequestSchema } from "../../schemas/create-open-request";
import { buildPublishListingSchema } from "../../schemas/publish-listing";
import { buildRequestQuoteSchema } from "../../schemas/request-quote";
import { buildRespondQuoteSchema } from "../../schemas/respond-quote";
import { buildStartOpenRequestNegotiationSchema } from "../../schemas/start-open-request-negotiation";
import {
  actorBodyDtoSchema,
  createOpenRequestDtoSchema,
  createRequestDtoSchema,
  publishListingRequestDtoSchema,
  respondRequestDtoSchema,
  startOpenRequestNegotiationDtoSchema,
  type ListingDto,
  type OpenRequestDto,
  type QuoteRequestDto,
} from "../dto";
import { toListing, toOpenRequest, toQuoteRequest } from "../mapper";
import { LOCAL_PRODUCER } from "./fixtures";
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
  closed: "El proyecto elegido no está publicado.",
  unit: "La unidad del proyecto no coincide con la de la solicitud.",
  not_owned: "El proyecto elegido no pertenece a este productor.",
  sold_out: "El proyecto elegido no tiene disponibilidad.",
} as const;

const isParty = (value: string): value is "BUYER" | "PRODUCER" => value === "BUYER" || value === "PRODUCER";

interface Options {
  today?: () => string;
}

// Presales and negotiation routes only. Paths are anchored so this handler never shadows GET /projects/:id
// (it owns /projects/:id/presales and the ext-* external projects, and nothing else under /projects).
export function createPresalesMockFetch(store: PresalesMockStore, delegate: typeof fetch, { today = isoToday }: Options = {}): typeof fetch {
  let nextListing = store.presaleListings.length + 1;
  let nextRequest = store.quoteRequests.length + 1;
  let nextOpenRequest = store.openRequests.length + 1;
  let nextHistory = store.quoteRequests.reduce((n, r) => n + r.history.length, 0) + 1;

  const acceptedQuantity = (requests: QuoteRequestDto[]) =>
    requests.flatMap((r) => r.quotes).filter((q) => q.status === "ACCEPTED").reduce((sum, q) => sum + q.quantity, 0);

  // Server-derived quantities, recomputed on every read: both negotiation origins count against a listing.
  const committedFor = (listingId: string) => acceptedQuantity(store.quoteRequests.filter((r) => r.listing_id === listingId));
  const awardedFor = (openRequestId: string) => acceptedQuantity(store.quoteRequests.filter((r) => r.open_request_id === openRequestId));

  const serializeListing = (l: ListingDto): ListingDto => ({ ...l, committed_quantity: committedFor(l.id) });
  const serializeOpenRequest = (o: OpenRequestDto): OpenRequestDto => ({ ...o, awarded_quantity: awardedFor(o.id) });
  const findListing = (id: string) => store.presaleListings.find((l) => l.id === id);
  const findRequest = (id: string) => store.quoteRequests.find((r) => r.id === id);
  const findOpenRequest = (id: string) => store.openRequests.find((o) => o.id === id);
  const domainListing = (l: ListingDto) => toListing(serializeListing(l));
  const domainOpenRequest = (o: OpenRequestDto) => toOpenRequest(serializeOpenRequest(o));

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

  const offerPayload = (q: { revision: number; unit_price: number; quantity: number }) => ({
    revision: q.revision,
    unit_price: q.unit_price,
    quantity: q.quantity,
    total: saleQuoteTotal(q.quantity, q.unit_price),
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

    // --- listings ---
    if (method === "GET" && path === "/presales") {
      const status = url.searchParams.get("status");
      return json(store.presaleListings.filter((l) => !status || l.status === status).map(serializeListing));
    }

    const listingMatch = path.match(/^\/presales\/([^/]+)$/);
    if (method === "GET" && listingMatch) {
      const listing = findListing(listingMatch[1]);
      return listing ? json(serializeListing(listing)) : json({ error: "Presale not found" }, 404);
    }

    const projectPresales = path.match(/^\/projects\/([^/]+)\/presales$/);
    if (method === "GET" && projectPresales) {
      return json(store.presaleListings.filter((l) => l.project_id === projectPresales[1]).map(serializeListing));
    }
    if (method === "POST" && projectPresales) {
      const project = store.projects.find((p) => p.id === projectPresales[1]);
      if (!project) return json({ error: "Project not found" }, 404);
      const dto = publishListingRequestDtoSchema.safeParse(readBody(init));
      if (!dto.success) return malformed();

      const existing = store.presaleListings.filter((l) => l.project_id === project.id).map(toListing);
      const block = publishBlock(project.current_status, existing);
      if (block === "project_status") return conflict("No se puede publicar un proyecto en este estado.");
      if (block === "open_listing_exists") return conflict("Este proyecto ya está publicado.");

      const parsed = buildPublishListingSchema(now).safeParse({
        title: dto.data.title,
        summary: dto.data.summary,
        expectedQuantity: dto.data.expected_quantity,
        unit: dto.data.unit,
        referenceUnitPrice: dto.data.reference_unit_price,
        estimatedHarvestDate: dto.data.estimated_harvest_date,
      });
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));

      const listing: ListingDto = {
        id: `presale-${nextListing++}`,
        project_id: project.id,
        producer_id: LOCAL_PRODUCER.id,
        producer_name: LOCAL_PRODUCER.name,
        title: parsed.data.title,
        summary: parsed.data.summary,
        // Copied from the project so the catalog can filter without joining.
        production_type: project.production_type,
        expected_quantity: parsed.data.expectedQuantity,
        unit: parsed.data.unit,
        reference_unit_price: parsed.data.referenceUnitPrice,
        currency: "COP",
        estimated_harvest_date: parsed.data.estimatedHarvestDate,
        status: "OPEN",
        committed_quantity: 0,
        created_at: new Date().toISOString(),
      };
      store.presaleListings.push(listing);
      return json(serializeListing(listing), 201);
    }

    const close = path.match(/^\/presales\/([^/]+)\/close$/);
    if (method === "POST" && close) {
      const listing = findListing(close[1]);
      if (!listing) return json({ error: "Presale not found" }, 404);
      const next = nextStatus(LISTING_TRANSITIONS, listing.status, "close");
      if (!next) return conflict("La publicación ya está cerrada.");
      listing.status = next;
      return json(serializeListing(listing));
    }

    // --- negotiations opened from a project ---
    const createRequest = path.match(/^\/presales\/([^/]+)\/quote-requests$/);
    if (method === "POST" && createRequest) {
      const listing = findListing(createRequest[1]);
      if (!listing) return json({ error: "Presale not found" }, 404);
      const dto = createRequestDtoSchema.safeParse(readBody(init));
      if (!dto.success) return malformed();

      const asDomain = domainListing(listing);
      if (asDomain.status !== "OPEN") return conflict("Este proyecto ya no recibe solicitudes.");
      const available = availableQuantity(asDomain);
      if (available <= 0) return conflict("Este proyecto no tiene disponibilidad.");

      const parsed = buildRequestQuoteSchema({ available, today: now }).safeParse({
        quantity: dto.data.quantity,
        desiredDeliveryDate: dto.data.desired_delivery_date,
        notes: dto.data.notes,
      });
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));

      const request: QuoteRequestDto = {
        id: `qr-${nextRequest++}`,
        origin: "PROJECT_INTEREST",
        listing_id: listing.id,
        project_id: listing.project_id,
        producer_id: listing.producer_id ?? LOCAL_PRODUCER.id,
        producer_name: listing.producer_name ?? LOCAL_PRODUCER.name,
        buyer_id: dto.data.buyer_id,
        buyer_name: dto.data.buyer_name,
        quantity: parsed.data.quantity,
        desired_delivery_date: parsed.data.desiredDeliveryDate,
        notes: parsed.data.notes,
        status: "REQUESTED",
        created_at: new Date().toISOString(),
        quotes: [],
        history: [],
      };
      appendHistory(request, "BUYER", "REQUESTED", null, "REQUESTED");
      store.quoteRequests.push(request);
      return json(request, 201);
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
      const action = status === "REQUESTED" ? "respond" : "counter";
      if (!nextStatus(REQUEST_TRANSITIONS, status, action)) {
        return conflict(status === "EXPIRED" ? EXPIRED_MESSAGE : "Esta negociación ya no admite ofertas.");
      }
      if (!canAct(asDomain, author, action, now)) return conflict(TURN_MESSAGE);

      const listing = findListing(request.listing_id);
      if (!listing) return json({ error: "Presale not found" }, 404);
      const listingDomain = domainListing(listing);
      // A closed listing blocks the first response; live negotiations may still be countered.
      if (action === "respond" && listingDomain.status !== "OPEN") {
        return conflict("La publicación está cerrada: no se pueden enviar nuevas cotizaciones.");
      }
      const available = availableQuantity(listingDomain);
      if (available <= 0) return conflict("Este proyecto no tiene disponibilidad.");

      const openRequest = request.open_request_id ? findOpenRequest(request.open_request_id) : undefined;
      const cap = offerCap({
        available,
        remaining: openRequest ? remainingToAward(domainOpenRequest(openRequest)) : undefined,
        requested: action === "respond" ? request.quantity : undefined,
      });
      const raw = {
        unitPrice: dto.data.unit_price,
        quantity: dto.data.quantity,
        validUntil: dto.data.valid_until,
        deliveryDate: dto.data.delivery_date,
        deliveryTerms: dto.data.delivery_terms,
      };
      const parsed =
        action === "respond"
          ? buildRespondQuoteSchema({ requested: request.quantity, available, today: now }).safeParse(raw)
          : buildCounterOfferSchema({ cap, today: now }).safeParse(raw);
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));
      const terms = parsed.data as { unitPrice: number; quantity: number; validUntil: string; deliveryTerms: string; deliveryDate?: string };

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
      move(request, action, author, action === "respond" ? "OFFER" : "COUNTER_OFFER", offerPayload(quote));
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

      if (action === "accept") {
        const listing = findListing(request.listing_id);
        if (!listing) return json({ error: "Presale not found" }, 404);
        // Re-checked at accept time: other agreements may have taken the supply since this offer was sent.
        const oversold = oversellGuard(domainListing(listing), quote.quantity);
        if (!oversold.ok) return conflict(`Supera la cantidad disponible (${oversold.available}).`);
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

      const listing = findListing(dto.data.listing_id);
      if (!listing) return invalid({ listingId: ["Selecciona el proyecto que respalda la oferta."] });
      const listingDomain = domainListing(listing);
      const block = backingListingBlock(listingDomain, openDomain, dto.data.producer_id);
      if (block) return conflict(BACKING_MESSAGES[block]);

      const parsed = buildStartOpenRequestNegotiationSchema({
        remaining: remainingToAward(openDomain),
        availableByListing: { [listing.id]: availableQuantity(listingDomain) },
        today: now,
      }).safeParse({
        listingId: dto.data.listing_id,
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
        listing_id: listing.id,
        project_id: listing.project_id,
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
