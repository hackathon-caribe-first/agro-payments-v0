import type { MilestoneRepository } from "../../milestones/application/milestone-repository";
import { err, ok } from "../../milestones/domain/errors";
import { toFieldErrors } from "../../milestones/schemas/evidence-log";
import type { Project } from "../../projects/domain/project";
import { milestoneProgress, type MilestoneProgress } from "../../projects/domain/project-rules";
import type { ProjectRepository } from "../../projects/application/project-repository";
import { attemptPresale, type PresaleError, type PresaleResult } from "../domain/errors";
import type { Actor, OpenRequest, OpenRequestView, PresaleListing, QuoteRequest, SaleQuote } from "../domain/presale";
import {
  allocationGuard,
  availableQuantity,
  backingListingBlock,
  canAct,
  canRequest,
  canStartOnOpenRequest,
  effectiveQuoteStatus,
  effectiveRequestStatus,
  hasActiveNegotiation,
  isNegotiationActive,
  isOwnProducer,
  latestQuote,
  offerCap,
  openRequestView,
  oversellGuard,
  publishBlock,
  remainingToAward,
  whoseTurn,
} from "../domain/presale-rules";
import { LISTING_TRANSITIONS, OPEN_REQUEST_TRANSITIONS, REQUEST_TRANSITIONS, nextStatus } from "../domain/transitions";
import { buildCounterOfferSchema } from "../schemas/counter-offer";
import { buildCreateOpenRequestSchema } from "../schemas/create-open-request";
import { buildPublishListingSchema } from "../schemas/publish-listing";
import { buildRequestQuoteSchema } from "../schemas/request-quote";
import { buildRespondQuoteSchema, revisionSchema } from "../schemas/respond-quote";
import { buildStartOpenRequestNegotiationSchema } from "../schemas/start-open-request-negotiation";
import type { PartyIdentity, PresaleRepository } from "./presale-repository";

export interface PresaleDeps {
  presales: PresaleRepository;
  projects: ProjectRepository;
  milestones: MilestoneRepository;
  // Injected clock (yyyy-mm-dd) so rules stay pure and testable.
  today: () => string;
  // The producer this app acts as; null when the caller is not a producer (a legacy null owner always matches).
  ownProducerId: string | null;
}

export interface ListingEntry {
  listing: PresaleListing;
  projectTitle: string;
}

export interface ListingDetail {
  listing: PresaleListing;
  project: Project;
  progress: MilestoneProgress;
  canRequest: boolean;
}

export interface ProjectPresale {
  project: Project;
  listing: PresaleListing | null;
  requests: RequestEntry[];
}

export interface RequestEntry {
  request: QuoteRequest;
  listing: PresaleListing | null;
  // Whose move it is; null when the negotiation has ended.
  turn: Actor | null;
}

export interface RequestDetail extends RequestEntry {
  project: Project | null;
  openRequest: OpenRequest | null;
}

export interface OpenRequestEntry {
  openRequest: OpenRequest;
  view: OpenRequestView;
  remaining: number;
}

export interface OpenRequestBoard extends OpenRequestEntry {
  negotiations: RequestEntry[];
}

export interface BackingOption {
  listing: PresaleListing;
  projectTitle: string;
  available: number;
}

export interface OpenRequestForProducer extends OpenRequestEntry {
  canStart: boolean;
  // The producer's live negotiation on this request, if any.
  own: RequestEntry | null;
  options: BackingOption[];
}

const invalidTransition = (from: string, action: string): PresaleError => ({ kind: "invalid_transition", from, action });

// Reads return the status a user should see today: lazy expiry is applied here, never stored.
function withEffectiveStatus(request: QuoteRequest, today: string): QuoteRequest {
  return {
    ...request,
    status: effectiveRequestStatus(request, today),
    quotes: request.quotes.map((q) => ({ ...q, status: effectiveQuoteStatus(q, today) })),
  };
}

async function toEntries(deps: PresaleDeps, requests: QuoteRequest[]): Promise<RequestEntry[]> {
  const today = deps.today();
  const listings = new Map<string, PresaleListing | null>();
  for (const id of new Set(requests.map((r) => r.listingId))) listings.set(id, await deps.presales.getListing(id));
  return requests
    .map((request) => withEffectiveStatus(request, today))
    .map((request) => ({ request, listing: listings.get(request.listingId) ?? null, turn: whoseTurn(request, today) }))
    .sort((a, b) => b.request.createdAt.localeCompare(a.request.createdAt));
}

const openEntry = (openRequest: OpenRequest, today: string): OpenRequestEntry => ({
  openRequest,
  view: openRequestView(openRequest, today),
  remaining: remainingToAward(openRequest),
});

// ---- listings ----

export const publishListing = (deps: PresaleDeps, projectId: string, raw: unknown) =>
  attemptPresale<PresaleListing>(async () => {
    const project = await deps.projects.getProject(projectId);
    if (!project) return err({ kind: "not_found" });
    const block = publishBlock(project.currentStatus, await deps.presales.listByProject(projectId));
    if (block === "project_status") return err(invalidTransition(project.currentStatus, "publish"));
    if (block === "open_listing_exists") return err(invalidTransition("OPEN", "publish"));

    const parsed = buildPublishListingSchema(deps.today()).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.presales.publish(projectId, parsed.data));
  });

export const closeListing = (deps: PresaleDeps, listingId: string) =>
  attemptPresale<PresaleListing>(async () => {
    const listing = await deps.presales.getListing(listingId);
    if (!listing) return err({ kind: "not_found" });
    if (!nextStatus(LISTING_TRANSITIONS, listing.status, "close")) return err(invalidTransition(listing.status, "close"));
    return ok(await deps.presales.close(listingId));
  });

export const listOpenListings = (deps: PresaleDeps) =>
  attemptPresale<ListingEntry[]>(async () => {
    const listings = await deps.presales.listOpenListings();
    const titles = new Map<string, string>();
    for (const id of new Set(listings.map((l) => l.projectId))) {
      titles.set(id, (await deps.projects.getProject(id))?.title ?? "");
    }
    return ok(listings.map((listing) => ({ listing, projectTitle: titles.get(listing.projectId) ?? "" })));
  });

export const getListingDetail = (deps: PresaleDeps, listingId: string) =>
  attemptPresale<ListingDetail>(async () => {
    const listing = await deps.presales.getListing(listingId);
    if (!listing) return err({ kind: "not_found" });
    const project = await deps.projects.getProject(listing.projectId);
    if (!project) return err({ kind: "not_found" });
    const milestones = await deps.milestones.listByProject(project.id);
    return ok({ listing, project, progress: milestoneProgress(milestones), canRequest: canRequest(listing) });
  });

export const getProjectPresale = (deps: PresaleDeps, projectId: string) =>
  attemptPresale<ProjectPresale>(async () => {
    const project = await deps.projects.getProject(projectId);
    if (!project) return err({ kind: "not_found" });
    const listings = await deps.presales.listByProject(projectId);
    const current = listings.find((l) => l.status === "OPEN") ?? null;
    const requests = await toEntries(deps, await deps.presales.listProducerRequests(projectId, deps.ownProducerId ?? undefined));
    return ok({ project, listing: current, requests });
  });

// ---- negotiations opened from a project ----

// The buyer opens a negotiation from a project's presale. (Original name kept: it is the same use case.)
export const requestQuote = (deps: PresaleDeps, listingId: string, buyer: PartyIdentity, raw: unknown) =>
  attemptPresale<QuoteRequest>(async () => {
    const listing = await deps.presales.getListing(listingId);
    if (!listing) return err({ kind: "not_found" });
    if (!canRequest(listing)) return err(invalidTransition(listing.status === "OPEN" ? "SOLD_OUT" : listing.status, "request"));

    const parsed = buildRequestQuoteSchema({ available: availableQuantity(listing), today: deps.today() }).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.presales.createRequest(listingId, buyer, parsed.data));
  });

export const startProjectNegotiation = requestQuote;

async function loadRequest(deps: PresaleDeps, requestId: string) {
  const request = await deps.presales.getRequest(requestId);
  return request ? withEffectiveStatus(request, deps.today()) : null;
}

// A producer only sees negotiations of their own projects: anything else reads as not found.
const visibleTo = (request: QuoteRequest, actor: Actor, deps: PresaleDeps) =>
  actor !== "PRODUCER" || isOwnProducer(request.producerId, deps.ownProducerId);

export const cancelRequest = (deps: PresaleDeps, requestId: string) =>
  attemptPresale<QuoteRequest>(async () => {
    const request = await loadRequest(deps, requestId);
    if (!request) return err({ kind: "not_found" });
    if (!canAct(request, "BUYER", "cancel", deps.today())) return err(invalidTransition(request.status, "cancel"));
    return ok(await deps.presales.cancel(requestId));
  });

export const declineRequest = (deps: PresaleDeps, requestId: string) =>
  attemptPresale<QuoteRequest>(async () => {
    const request = await loadRequest(deps, requestId);
    if (!request || !visibleTo(request, "PRODUCER", deps)) return err({ kind: "not_found" });
    if (!canAct(request, "PRODUCER", "decline", deps.today())) return err(invalidTransition(request.status, "decline"));
    return ok(await deps.presales.decline(requestId));
  });

// The producer's first response to a project-interest request.
export const respondToRequest = (deps: PresaleDeps, requestId: string, raw: unknown) =>
  attemptPresale<QuoteRequest>(async () => {
    const request = await loadRequest(deps, requestId);
    if (!request || !visibleTo(request, "PRODUCER", deps)) return err({ kind: "not_found" });
    if (!canAct(request, "PRODUCER", "respond", deps.today())) return err(invalidTransition(request.status, "respond"));

    const listing = await deps.presales.getListing(request.listingId);
    if (!listing) return err({ kind: "not_found" });
    // A closed listing blocks new quotes.
    if (listing.status !== "OPEN") return err(invalidTransition(listing.status, "respond"));
    const available = availableQuantity(listing);
    if (available <= 0) return err({ kind: "oversold", available });

    const parsed = buildRespondQuoteSchema({ requested: request.quantity, available, today: deps.today() }).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.presales.respond(requestId, parsed.data));
  });

// ---- rounds: counter-offer, accept, reject, withdraw ----

// Either party's counter-offer. A closed listing or request does not block it: live negotiations continue, but the
// supply (and, for open requests, the remaining quantity) always caps the quantity.
export const counterOffer = (deps: PresaleDeps, requestId: string, actor: Actor, raw: unknown) =>
  attemptPresale<QuoteRequest>(async () => {
    const request = await loadRequest(deps, requestId);
    if (!request || !visibleTo(request, actor, deps)) return err({ kind: "not_found" });
    const today = deps.today();
    if (!nextStatus(REQUEST_TRANSITIONS, request.status, "counter")) return err(invalidTransition(request.status, "counter"));
    if (!canAct(request, actor, "counter", today)) return err({ kind: "not_your_turn", turn: whoseTurn(request, today) });

    const listing = await deps.presales.getListing(request.listingId);
    if (!listing) return err({ kind: "not_found" });
    const available = availableQuantity(listing);
    if (available <= 0) return err({ kind: "oversold", available });
    const openRequest = request.openRequestId ? await deps.presales.getOpenRequest(request.openRequestId) : null;

    const cap = offerCap({ available, remaining: openRequest ? remainingToAward(openRequest) : undefined });
    const parsed = buildCounterOfferSchema({ cap, today }).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.presales.counter(requestId, actor, parsed.data));
  });

type Decision = { failure: PresaleError } | { failure?: undefined; request: QuoteRequest; quote: SaleQuote };

// Decisions always target the LATEST revision, and only the party whose turn it is may decide.
async function loadDecision(deps: PresaleDeps, requestId: string, rawRevision: unknown, actor: Actor, action: "accept" | "reject"): Promise<Decision> {
  const request = await loadRequest(deps, requestId);
  if (!request || !visibleTo(request, actor, deps)) return { failure: { kind: "not_found" } };
  const revision = revisionSchema.safeParse(rawRevision);
  const latest = latestQuote(request);
  if (!revision.success || !latest || latest.revision !== revision.data) return { failure: { kind: "not_found" } };

  const today = deps.today();
  if (!nextStatus(REQUEST_TRANSITIONS, request.status, action) || latest.status !== "SENT") {
    return { failure: invalidTransition(latest.status === "EXPIRED" ? "EXPIRED" : request.status, action) };
  }
  if (!canAct(request, actor, action, today)) return { failure: { kind: "not_your_turn", turn: whoseTurn(request, today) } };
  return { request, quote: latest };
}

export const acceptSaleQuote = (deps: PresaleDeps, requestId: string, rawRevision: unknown, actor: Actor = "BUYER") =>
  attemptPresale<QuoteRequest>(async () => {
    const decision = await loadDecision(deps, requestId, rawRevision, actor, "accept");
    if (decision.failure) return err(decision.failure);

    const listing = await deps.presales.getListing(decision.request.listingId);
    if (!listing) return err({ kind: "not_found" });
    // Closing the listing does not block accepting a still-valid offer; overselling does.
    const oversold = oversellGuard(listing, decision.quote.quantity);
    if (!oversold.ok) return err({ kind: "oversold", available: oversold.available });

    if (decision.request.openRequestId) {
      const openRequest = await deps.presales.getOpenRequest(decision.request.openRequestId);
      if (!openRequest) return err({ kind: "not_found" });
      const allocation = allocationGuard(openRequest, decision.quote.quantity);
      if (!allocation.ok) return err({ kind: "over_allocated", remaining: allocation.remaining });
    }
    return ok(await deps.presales.acceptQuote(requestId, decision.quote.revision, actor));
  });

export const rejectSaleQuote = (deps: PresaleDeps, requestId: string, rawRevision: unknown, actor: Actor = "BUYER") =>
  attemptPresale<QuoteRequest>(async () => {
    const decision = await loadDecision(deps, requestId, rawRevision, actor, "reject");
    if (decision.failure) return err(decision.failure);
    return ok(await deps.presales.rejectQuote(requestId, decision.quote.revision, actor));
  });

// Either party may withdraw while the negotiation is not over, whoever's turn it is.
export const withdrawNegotiation = (deps: PresaleDeps, requestId: string, actor: Actor) =>
  attemptPresale<QuoteRequest>(async () => {
    const request = await loadRequest(deps, requestId);
    if (!request || !visibleTo(request, actor, deps)) return err({ kind: "not_found" });
    if (!canAct(request, actor, "withdraw", deps.today())) return err(invalidTransition(request.status, "withdraw"));
    return ok(await deps.presales.withdraw(requestId, actor));
  });

// ---- inboxes and detail ----

export const listBuyerRequests = (deps: PresaleDeps, buyerId: string) =>
  attemptPresale<RequestEntry[]>(async () => ok(await toEntries(deps, await deps.presales.listBuyerRequests(buyerId))));

export const listProducerRequests = (deps: PresaleDeps, projectId?: string) =>
  attemptPresale<RequestEntry[]>(async () =>
    ok(await toEntries(deps, await deps.presales.listProducerRequests(projectId, deps.ownProducerId ?? undefined))),
  );

// `viewer` PRODUCER hides negotiations that belong to other producers.
export const getRequestDetail = (deps: PresaleDeps, requestId: string, viewer: Actor = "BUYER") =>
  attemptPresale<RequestDetail>(async () => {
    const request = await loadRequest(deps, requestId);
    if (!request || !visibleTo(request, viewer, deps)) return err({ kind: "not_found" });
    const [listing, project, openRequest] = await Promise.all([
      deps.presales.getListing(request.listingId),
      deps.projects.getProject(request.projectId),
      request.openRequestId ? deps.presales.getOpenRequest(request.openRequestId) : Promise.resolve(null),
    ]);
    return ok({ request, listing, project, openRequest, turn: whoseTurn(request, deps.today()) });
  });

// ---- open requests ----

export const createOpenRequest = (deps: PresaleDeps, buyer: PartyIdentity, raw: unknown) =>
  attemptPresale<OpenRequest>(async () => {
    const parsed = buildCreateOpenRequestSchema(deps.today()).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.presales.createOpenRequest(buyer, parsed.data));
  });

export const closeOpenRequest = (deps: PresaleDeps, openRequestId: string) =>
  attemptPresale<OpenRequest>(async () => {
    const openRequest = await deps.presales.getOpenRequest(openRequestId);
    if (!openRequest) return err({ kind: "not_found" });
    if (!nextStatus(OPEN_REQUEST_TRANSITIONS, openRequest.status, "close")) return err(invalidTransition(openRequest.status, "close_open_request"));
    return ok(await deps.presales.closeOpenRequest(openRequestId));
  });

export const listBuyerOpenRequests = (deps: PresaleDeps, buyerId: string) =>
  attemptPresale<OpenRequestEntry[]>(async () => {
    const today = deps.today();
    const list = await deps.presales.listBuyerOpenRequests(buyerId);
    return ok(list.map((o) => openEntry(o, today)).sort((a, b) => b.openRequest.createdAt.localeCompare(a.openRequest.createdAt)));
  });

export const getOpenRequestBoard = (deps: PresaleDeps, openRequestId: string) =>
  attemptPresale<OpenRequestBoard>(async () => {
    const openRequest = await deps.presales.getOpenRequest(openRequestId);
    if (!openRequest) return err({ kind: "not_found" });
    const negotiations = await toEntries(deps, await deps.presales.listOpenRequestNegotiations(openRequestId));
    return ok({ ...openEntry(openRequest, deps.today()), negotiations });
  });

// Producer catalog: open requests that can still take a negotiation.
export const listOpenRequestCatalog = (deps: PresaleDeps) =>
  attemptPresale<OpenRequestEntry[]>(async () => {
    const today = deps.today();
    const list = await deps.presales.listOpenRequests("OPEN");
    return ok(
      list
        .filter((o) => canStartOnOpenRequest(o, today))
        .map((o) => openEntry(o, today))
        .sort((a, b) => a.openRequest.deliveryDate.localeCompare(b.openRequest.deliveryDate)),
    );
  });

export const getOpenRequestForProducer = (deps: PresaleDeps, openRequestId: string) =>
  attemptPresale<OpenRequestForProducer>(async () => {
    const today = deps.today();
    const openRequest = await deps.presales.getOpenRequest(openRequestId);
    if (!openRequest) return err({ kind: "not_found" });

    const negotiations = await deps.presales.listOpenRequestNegotiations(openRequestId);
    const ownLive = negotiations.filter((n) => isOwnProducer(n.producerId, deps.ownProducerId) && isNegotiationActive(n, today));
    const own = ownLive[0] ? (await toEntries(deps, [ownLive[0]]))[0] : null;

    // Backing options: the producer's projects with an OPEN listing in the same unit and stock left.
    const options: BackingOption[] = [];
    for (const project of await deps.projects.listProducerProjects()) {
      for (const listing of await deps.presales.listByProject(project.id)) {
        if (backingListingBlock(listing, openRequest, deps.ownProducerId) === null) {
          options.push({ listing, projectTitle: project.title, available: availableQuantity(listing) });
        }
      }
    }
    return ok({ ...openEntry(openRequest, today), canStart: canStartOnOpenRequest(openRequest, today), own, options });
  });

export const startOpenRequestNegotiation = (deps: PresaleDeps, openRequestId: string, producer: PartyIdentity, raw: unknown) =>
  attemptPresale<QuoteRequest>(async () => {
    const today = deps.today();
    const openRequest = await deps.presales.getOpenRequest(openRequestId);
    if (!openRequest) return err({ kind: "not_found" });
    if (!canStartOnOpenRequest(openRequest, today)) {
      return err(invalidTransition(openRequest.status === "CLOSED" ? "CLOSED" : openRequestView(openRequest, today), "start_on_open_request"));
    }

    const negotiations = await deps.presales.listOpenRequestNegotiations(openRequestId);
    if (hasActiveNegotiation(negotiations, producer.id, today)) return err({ kind: "duplicate_negotiation" });

    const listingId = typeof (raw as { listingId?: unknown } | null)?.listingId === "string" ? (raw as { listingId: string }).listingId : "";
    const listing = listingId ? await deps.presales.getListing(listingId) : null;
    if (!listing) return err({ kind: "validation", fieldErrors: { listingId: ["Selecciona el proyecto que respalda la oferta."] } });
    const block = backingListingBlock(listing, openRequest, producer.id);
    if (block) return err({ kind: "backing_mismatch", reason: block });

    const parsed = buildStartOpenRequestNegotiationSchema({
      remaining: remainingToAward(openRequest),
      availableByListing: { [listing.id]: availableQuantity(listing) },
      today,
    }).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.presales.startOpenRequestNegotiation(openRequestId, producer, parsed.data));
  });

export type { PresaleResult };
