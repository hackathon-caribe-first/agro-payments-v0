import type {
  Actor,
  ListingUnit,
  OpenRequest,
  OpenRequestView,
  PresaleListing,
  QuoteRequest,
  QuoteStatus,
  RequestStatus,
  SaleQuote,
} from "./presale";
import { ACTION_ACTOR, REQUEST_TRANSITIONS, nextStatus } from "./transitions";

// Local yyyy-mm-dd. Rules receive `today` as an argument so they stay pure and the clock is injectable.
export function isoToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export const availableQuantity = (l: Pick<PresaleListing, "expectedQuantity" | "committedQuantity">): number =>
  Math.max(0, l.expectedQuantity - l.committedQuantity);

// The single place where an offer total is computed (form, domain and mock all use it).
export const saleQuoteTotal = (quantity: number, unitPrice: number): number => quantity * unitPrice;

// Accept, reject and counter always target the latest revision of the negotiation.
export const latestQuote = (r: Pick<QuoteRequest, "quotes">): SaleQuote | undefined =>
  r.quotes.reduce<SaleQuote | undefined>((best, q) => (!best || q.revision > best.revision ? q : best), undefined);

// Lazy expiry: a SENT offer is expired once validUntil is before today. Nothing is stored.
export const effectiveQuoteStatus = (q: Pick<SaleQuote, "status" | "validUntil">, today: string): QuoteStatus =>
  q.status === "SENT" && q.validUntil < today ? "EXPIRED" : q.status;

// QUOTED and NEGOTIATING both hold a live offer, so both can lapse. EXPIRED is final.
export function effectiveRequestStatus(r: Pick<QuoteRequest, "status" | "quotes">, today: string): RequestStatus {
  if (r.status !== "QUOTED" && r.status !== "NEGOTIATING") return r.status;
  const latest = latestQuote(r);
  return latest && effectiveQuoteStatus(latest, today) === "EXPIRED" ? "EXPIRED" : r.status;
}

// Whose move it is: the producer answers a fresh request; afterwards the non-author of the latest SENT offer.
export function whoseTurn(r: Pick<QuoteRequest, "status" | "quotes">, today: string): Actor | null {
  const status = effectiveRequestStatus(r, today);
  if (status === "REQUESTED") return "PRODUCER";
  if (status !== "QUOTED" && status !== "NEGOTIATING") return null;
  const latest = latestQuote(r);
  if (!latest || latest.status !== "SENT") return null;
  return latest.author === "BUYER" ? "PRODUCER" : "BUYER";
}

// Table row + actor rule. The "first counter" rule is implied: a fresh REQUESTED negotiation has no counter row
// and the turn belongs to the producer, so a buyer can only counter after the producer's first offer.
export function canAct(r: Pick<QuoteRequest, "status" | "quotes">, actor: Actor, action: string, today: string): boolean {
  if (!nextStatus(REQUEST_TRANSITIONS, effectiveRequestStatus(r, today), action)) return false;
  const rule = ACTION_ACTOR[action];
  if (rule === "ANY") return actor === "BUYER" || actor === "PRODUCER";
  if (rule === "TURN") return whoseTurn(r, today) === actor;
  return rule === actor;
}

export const canCounter = (r: Pick<QuoteRequest, "status" | "quotes">, actor: Actor, today: string) => canAct(r, actor, "counter", today);
export const canWithdraw = (r: Pick<QuoteRequest, "status" | "quotes">, actor: Actor, today: string) => canAct(r, actor, "withdraw", today);

// Terminal statuses end the negotiation (EXPIRED included).
export const isNegotiationActive = (r: Pick<QuoteRequest, "status" | "quotes">, today: string): boolean =>
  nextStatus(REQUEST_TRANSITIONS, effectiveRequestStatus(r, today), "withdraw") !== null;

// ---- listings ----

const PUBLISH_BLOCKED_PROJECT_STATUSES: readonly string[] = ["CANCELLED_OR_DISPUTED", "SETTLED_AND_CLOSED"];

export type PublishBlock = "project_status" | "open_listing_exists";

export function publishBlock(projectStatus: string, listings: readonly Pick<PresaleListing, "status">[]): PublishBlock | null {
  if (PUBLISH_BLOCKED_PROJECT_STATUSES.includes(projectStatus)) return "project_status";
  if (listings.some((l) => l.status === "OPEN")) return "open_listing_exists";
  return null;
}

export const canPublish = (projectStatus: string, listings: readonly Pick<PresaleListing, "status">[]): boolean =>
  publishBlock(projectStatus, listings) === null;

export const canRequest = (l: Pick<PresaleListing, "status" | "expectedQuantity" | "committedQuantity">): boolean =>
  l.status === "OPEN" && availableQuantity(l) > 0;

export const oversellGuard = (
  l: Pick<PresaleListing, "expectedQuantity" | "committedQuantity">,
  quantity: number,
): { ok: true } | { ok: false; available: number } => {
  const available = availableQuantity(l);
  return quantity <= available ? { ok: true } : { ok: false, available };
};

// Null producer id is the legacy single producer, which always counts as the current one.
export const isOwnProducer = (producerId: string | null, ownProducerId: string | null): boolean =>
  producerId === null || ownProducerId === null || producerId === ownProducerId;

// ---- open requests ----

export const remainingToAward = (or: Pick<OpenRequest, "quantity" | "awardedQuantity">): number =>
  Math.max(0, or.quantity - or.awardedQuantity);

// Derived lifecycle. A CLOSED request that was fully awarded still reads as FULFILLED.
export function openRequestView(or: Pick<OpenRequest, "status" | "quantity" | "awardedQuantity" | "deliveryDate">, today: string): OpenRequestView {
  if (or.status === "UNKNOWN") return "UNKNOWN";
  const fulfilled = or.awardedQuantity >= or.quantity;
  if (or.status === "CLOSED") return fulfilled ? "FULFILLED" : "CLOSED";
  if (fulfilled) return "FULFILLED";
  if (or.deliveryDate < today) return "EXPIRED";
  return or.awardedQuantity > 0 ? "PARTIALLY_AWARDED" : "OPEN";
}

// Only stored-OPEN requests with quantity left and a future need date accept new negotiations.
export const canStartOnOpenRequest = (or: OpenRequest, today: string): boolean => {
  if (or.status !== "OPEN") return false;
  const view = openRequestView(or, today);
  return view === "OPEN" || view === "PARTIALLY_AWARDED";
};

export const allocationGuard = (
  or: Pick<OpenRequest, "quantity" | "awardedQuantity">,
  quantity: number,
): { ok: true } | { ok: false; remaining: number } => {
  const remaining = remainingToAward(or);
  return quantity <= remaining ? { ok: true } : { ok: false, remaining };
};

// A producer may hold at most one live negotiation per open request.
export const hasActiveNegotiation = (
  negotiations: readonly Pick<QuoteRequest, "producerId" | "status" | "quotes">[],
  producerId: string | null,
  today: string,
): boolean => negotiations.some((n) => n.producerId === producerId && isNegotiationActive(n, today));

export type BackingBlock = "closed" | "unit" | "not_owned" | "sold_out";

// The producer's supply that backs an offer on an open request: OPEN, same UNIT (type is not enforced), theirs, with stock.
export function backingListingBlock(
  listing: Pick<PresaleListing, "status" | "unit" | "rawUnit" | "producerId" | "expectedQuantity" | "committedQuantity">,
  openRequest: Pick<OpenRequest, "unit" | "rawUnit">,
  producerId: string | null,
): BackingBlock | null {
  if (listing.status !== "OPEN") return "closed";
  if (listing.producerId !== null && listing.producerId !== producerId) return "not_owned";
  if (!sameUnit(listing, openRequest)) return "unit";
  if (availableQuantity(listing) <= 0) return "sold_out";
  return null;
}

function sameUnit(a: { unit: ListingUnit; rawUnit: string }, b: { unit: ListingUnit; rawUnit: string }): boolean {
  return a.unit !== "UNKNOWN" && a.unit === b.unit;
}

export interface OfferCap {
  cap: number;
  // Which limit binds, to name it in the validation message.
  reason: "available" | "remaining" | "requested";
}

// Largest quantity an offer may carry: the listing's availability, the open request's remaining quantity (open requests only),
// and, for a producer's FIRST response to a project-interest request, what the buyer asked for.
export function offerCap(input: { available: number; remaining?: number; requested?: number }): OfferCap {
  let cap: OfferCap = { cap: input.available, reason: "available" };
  if (input.remaining !== undefined && input.remaining < cap.cap) cap = { cap: input.remaining, reason: "remaining" };
  if (input.requested !== undefined && input.requested < cap.cap) cap = { cap: input.requested, reason: "requested" };
  return cap;
}
