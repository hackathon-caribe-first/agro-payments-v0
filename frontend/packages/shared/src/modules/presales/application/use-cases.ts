import type { MilestoneRepository } from "../../milestones/application/milestone-repository";
import { err, ok } from "../../milestones/domain/errors";
import { toFieldErrors } from "../../milestones/schemas/evidence-log";
import type { MilestoneSummary } from "../../milestones/domain/milestone";
import type { Project } from "../../projects/domain/project";
import { projectQuotationTotal } from "../../projects/domain/project-rules";
import type { ProjectRepository } from "../../projects/application/project-repository";
import { attemptPresale, type PresaleError, type PresaleResult } from "../domain/errors";
import type { Actor, ListingUnit, OpenRequest, OpenRequestView, QuoteRequest, SaleQuote } from "../domain/presale";
import {
  allocationGuard,
  backingProjectBlock,
  canAct,
  canStartOnOpenRequest,
  effectiveQuoteStatus,
  effectiveRequestStatus,
  hasActiveNegotiation,
  isNegotiationActive,
  isOwnProducer,
  latestQuote,
  openRequestView,
  quantityCap,
  remainingToAward,
  whoseTurn,
} from "../domain/presale-rules";
import { OPEN_REQUEST_TRANSITIONS, REQUEST_TRANSITIONS, nextStatus } from "../domain/transitions";
import { agreedMilestonePrices } from "../domain/negotiation-rules";
import { buildCounterOfferSchema } from "../schemas/counter-offer";
import { buildCreateOpenRequestSchema } from "../schemas/create-open-request";
import { expectedTotalSchema, revisionSchema } from "../schemas/revision";
import { buildMilestoneCounterSchema } from "../schemas/start-milestone-negotiation";
import { buildProjectCounterSchema } from "../schemas/start-project-negotiation";
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

export interface RequestEntry {
  request: QuoteRequest;
  projectTitle: string;
  // Title of the milestone a MILESTONE negotiation is about.
  milestoneTitle: string | null;
  // The unit its quantities are shown in: the buyer's unit on a PROJECT offer, the open request's unit otherwise.
  unit: UnitRef | null;
  // Whose move it is; null when the negotiation has ended.
  turn: Actor | null;
}

export interface RequestDetail extends RequestEntry {
  project: Project | null;
  openRequest: OpenRequest | null;
  milestone: MilestoneSummary | null;
  // The project quotation total for a PROJECT negotiation: frozen once agreed, otherwise the live preview.
  quotationTotal: number | null;
}

export interface OpenRequestEntry {
  openRequest: OpenRequest;
  view: OpenRequestView;
  remaining: number;
}

export interface OpenRequestBoard extends OpenRequestEntry {
  negotiations: RequestEntry[];
}

// One of the producer's projects an open-request offer can be backed with.
export interface BackingOption {
  project: Project;
  projectTitle: string;
}

export interface OpenRequestForProducer extends OpenRequestEntry {
  canStart: boolean;
  // The producer's live negotiation on this request, if any.
  own: RequestEntry | null;
  options: BackingOption[];
}

export interface UnitRef {
  unit: ListingUnit;
  rawUnit: string;
}

const invalidTransition = (from: string, action: string): PresaleError => ({ kind: "invalid_transition", from, action });

// Reads return the status a user should see today: lazy expiry is applied here, never stored.
export function withEffectiveStatus(request: QuoteRequest, today: string): QuoteRequest {
  return {
    ...request,
    status: effectiveRequestStatus(request, today),
    quotes: request.quotes.map((q) => ({ ...q, status: effectiveQuoteStatus(q, today) })),
  };
}

async function toEntries(deps: PresaleDeps, requests: QuoteRequest[]): Promise<RequestEntry[]> {
  const today = deps.today();
  const titles = new Map<string, string>();
  const milestones = new Map<string, MilestoneSummary[]>();
  const openRequests = new Map<string, OpenRequest | null>();
  for (const id of new Set(requests.map((r) => r.projectId))) {
    titles.set(id, (await deps.projects.getProject(id))?.title ?? "");
    if (requests.some((r) => r.projectId === id && r.scope === "MILESTONE")) milestones.set(id, await deps.milestones.listByProject(id));
  }
  for (const id of new Set(requests.map((r) => r.openRequestId).filter((id): id is string => id !== null))) {
    openRequests.set(id, await deps.presales.getOpenRequest(id));
  }
  return requests
    .map((request) => withEffectiveStatus(request, today))
    .map((request) => ({
      request,
      projectTitle: titles.get(request.projectId) ?? "",
      milestoneTitle: request.milestoneId ? (milestones.get(request.projectId)?.find((m) => m.id === request.milestoneId)?.title ?? null) : null,
      unit: unitOf(request, request.openRequestId ? (openRequests.get(request.openRequestId) ?? null) : null),
      turn: whoseTurn(request, today),
    }))
    .sort((a, b) => b.request.createdAt.localeCompare(a.request.createdAt));
}

// PROJECT offers carry the buyer's unit; open-request negotiations use the request's unit; milestone offers have none.
function unitOf(request: QuoteRequest, openRequest: OpenRequest | null): UnitRef | null {
  const terms = request.quotes[request.quotes.length - 1]?.terms;
  if (terms?.kind === "PROJECT") return { unit: terms.unit, rawUnit: terms.rawUnit };
  return openRequest ? { unit: openRequest.unit, rawUnit: openRequest.rawUnit } : null;
}

const openEntry = (openRequest: OpenRequest, today: string): OpenRequestEntry => ({
  openRequest,
  view: openRequestView(openRequest, today),
  remaining: remainingToAward(openRequest),
});

async function loadRequest(deps: PresaleDeps, requestId: string) {
  const request = await deps.presales.getRequest(requestId);
  return request ? withEffectiveStatus(request, deps.today()) : null;
}

// A producer only sees negotiations of their own projects: anything else reads as not found.
const visibleTo = (request: QuoteRequest, actor: Actor, deps: PresaleDeps) =>
  actor !== "PRODUCER" || isOwnProducer(request.producerId, deps.ownProducerId);

// ---- rounds: counter-offer, accept, reject, withdraw ----

// Either party's counter-offer. A closed project or open request does not block it: live negotiations continue, but an
// open-request negotiation is always capped by the quantity still to be awarded.
export const counterOffer = (deps: PresaleDeps, requestId: string, actor: Actor, raw: unknown) =>
  attemptPresale<QuoteRequest>(async () => {
    const request = await loadRequest(deps, requestId);
    if (!request || !visibleTo(request, actor, deps)) return err({ kind: "not_found" });
    const today = deps.today();
    if (!nextStatus(REQUEST_TRANSITIONS, request.status, "counter")) return err(invalidTransition(request.status, "counter"));
    if (!canAct(request, actor, "counter", today)) return err({ kind: "not_your_turn", turn: whoseTurn(request, today) });

    // Project negotiations: the terms and the "change at least one term" rule depend on the scope.
    if (request.scope === "PROJECT" || request.scope === "MILESTONE") {
      const latest = latestQuote(request)?.terms;
      if (request.scope === "PROJECT" && latest?.kind === "PROJECT") {
        const parsed = buildProjectCounterSchema({ today, latest }).safeParse(raw);
        if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
        return ok(await deps.presales.counterProject(requestId, actor, parsed.data));
      }
      if (request.scope === "MILESTONE" && latest?.kind === "MILESTONE") {
        const parsed = buildMilestoneCounterSchema({ today, latest }).safeParse(raw);
        if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
        return ok(await deps.presales.counterMilestone(requestId, actor, parsed.data));
      }
      return err(invalidTransition(request.status, "counter"));
    }

    // Open-request negotiations: only what is still to be awarded caps the quantity.
    const openRequest = request.openRequestId ? await deps.presales.getOpenRequest(request.openRequestId) : null;
    if (!openRequest) return err({ kind: "not_found" });

    const cap = quantityCap(remainingToAward(openRequest));
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

// `raw` carries the total the user saw ({ expectedTotal }) when a PROJECT offer is accepted.
export const acceptSaleQuote = (deps: PresaleDeps, requestId: string, rawRevision: unknown, actor: Actor = "BUYER", raw?: unknown) =>
  attemptPresale<QuoteRequest>(async () => {
    const decision = await loadDecision(deps, requestId, rawRevision, actor, "accept");
    if (decision.failure) return err(decision.failure);

    // Project negotiations: the server re-checks the agreement guards and, for the buyer on a PROJECT offer, deposits in the same step.
    if (decision.request.scope === "PROJECT" || decision.request.scope === "MILESTONE") {
      let expectedTotal: number | undefined;
      if (decision.request.scope === "PROJECT") {
        const given = (raw as { expectedTotal?: unknown } | null | undefined)?.expectedTotal;
        if (actor === "BUYER" || given !== undefined) {
          const parsed = expectedTotalSchema.safeParse({ expectedTotal: given });
          if (!parsed.success) return err({ kind: "validation", fieldErrors: { expectedTotal: ["Confirma el total del depósito."] } });
          expectedTotal = parsed.data.expectedTotal;
        }
      }
      return ok(await deps.presales.acceptQuote(requestId, decision.quote.revision, actor, expectedTotal));
    }

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
    const [project, openRequest, milestones] = await Promise.all([
      deps.projects.getProject(request.projectId),
      request.openRequestId ? deps.presales.getOpenRequest(request.openRequestId) : Promise.resolve(null),
      request.scope ? deps.milestones.listByProject(request.projectId) : Promise.resolve([] as MilestoneSummary[]),
    ]);
    let quotationTotal: number | null = null;
    if (request.scope === "PROJECT") {
      if (request.deposit) quotationTotal = request.deposit.agreedTotal;
      else {
        const prices = agreedMilestonePrices(await deps.presales.listBuyerRequests(request.buyerId), request.buyerId);
        quotationTotal = projectQuotationTotal(milestones, prices);
      }
    }
    return ok({
      request,
      unit: unitOf(request, openRequest),
      project,
      openRequest,
      projectTitle: project?.title ?? "",
      milestone: request.milestoneId ? (milestones.find((m) => m.id === request.milestoneId) ?? null) : null,
      milestoneTitle: request.milestoneId ? (milestones.find((m) => m.id === request.milestoneId)?.title ?? null) : null,
      quotationTotal,
      turn: whoseTurn(request, deps.today()),
    });
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

    // Backing options: the producer's own projects that are not closed or cancelled.
    const options: BackingOption[] = [];
    for (const project of await deps.projects.listProducerProjects()) {
      if (backingProjectBlock(project, true) === null) options.push({ project, projectTitle: project.title });
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

    const projectId = typeof (raw as { projectId?: unknown } | null)?.projectId === "string" ? (raw as { projectId: string }).projectId : "";
    const project = projectId ? await deps.projects.getProject(projectId) : null;
    if (!project) return err({ kind: "validation", fieldErrors: { projectId: ["Selecciona el proyecto que respalda la oferta."] } });
    const owned = (await deps.projects.listProducerProjects()).some((p) => p.id === project.id);
    const block = backingProjectBlock(project, owned);
    if (block) return err({ kind: "backing_mismatch", reason: block });

    const parsed = buildStartOpenRequestNegotiationSchema({ remaining: remainingToAward(openRequest), today }).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.presales.startOpenRequestNegotiation(openRequestId, producer, parsed.data));
  });

export type { PresaleResult };
