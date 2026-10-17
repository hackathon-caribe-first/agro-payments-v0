// Domain types for presales, negotiations (quote requests with offer rounds) and open requests.
// Naming: a "sale quote" / "offer" (SaleQuote) is what one party proposes to the other in a negotiation;
// it is unrelated to a project's cotización (budget).

export const UNITS = ["KG", "TON", "BULTO"] as const;
export type Unit = (typeof UNITS)[number];
// Units added by a newer server map to "UNKNOWN"; the raw string is kept for display.
export type ListingUnit = Unit | "UNKNOWN";

export const ACTORS = ["BUYER", "PRODUCER", "SYSTEM"] as const;
export type Actor = (typeof ACTORS)[number] | "UNKNOWN";

// Statuses cross the wire as free strings. Anything not listed here maps to "UNKNOWN" so newer
// servers degrade instead of crashing.
export const KNOWN_LISTING_STATUSES = ["OPEN", "CLOSED"] as const;
export const KNOWN_REQUEST_STATUSES = ["REQUESTED", "QUOTED", "NEGOTIATING", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"] as const;
export const KNOWN_QUOTE_STATUSES = ["SENT", "ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED", "WITHDRAWN"] as const;
export const KNOWN_OPEN_REQUEST_STATUSES = ["OPEN", "CLOSED"] as const;

// Where a negotiation started: the buyer approached a project, or a producer answered a buyer's open request.
export const ORIGINS = ["PROJECT_INTEREST", "OPEN_REQUEST"] as const;
// Event kinds of the append-only history. STATUS_CHANGED is the legacy generic kind.
export const HISTORY_KINDS = ["REQUESTED", "STATUS_CHANGED", "OFFER", "COUNTER_OFFER", "ACCEPT", "REJECT", "WITHDRAW", "EXPIRE"] as const;

export type ListingStatus = (typeof KNOWN_LISTING_STATUSES)[number] | "UNKNOWN";
export type RequestStatus = (typeof KNOWN_REQUEST_STATUSES)[number] | "UNKNOWN";
export type QuoteStatus = (typeof KNOWN_QUOTE_STATUSES)[number] | "UNKNOWN";
export type OpenRequestStatus = (typeof KNOWN_OPEN_REQUEST_STATUSES)[number] | "UNKNOWN";
export type Origin = (typeof ORIGINS)[number] | "UNKNOWN";
export type HistoryKind = (typeof HISTORY_KINDS)[number] | "UNKNOWN";

export interface PresaleListing {
  id: string;
  projectId: string;
  // Null means the legacy single producer, which is always "ours".
  producerId: string | null;
  producerName: string;
  title: string;
  summary: string;
  productionType: string;
  expectedQuantity: number;
  unit: ListingUnit;
  rawUnit: string;
  referenceUnitPrice: number;
  currency: string;
  estimatedHarvestDate: string;
  status: ListingStatus;
  // Server-derived: sum of the quantities of ACCEPTED offers (both negotiation origins).
  committedQuantity: number;
  createdAt: string;
}

// Keyed by (requestId, revision). Each counter-offer is a new revision; only the latest can be SENT.
export interface SaleQuote {
  requestId: string;
  revision: number;
  author: Actor;
  unitPrice: number;
  quantity: number;
  total: number;
  currency: string;
  deliveryDate: string | null;
  validUntil: string;
  deliveryTerms: string;
  status: QuoteStatus;
  createdAt: string;
}

// Append-only. `type` is a free string and `payload` is open so new event kinds pass the boundary.
export interface HistoryEntry {
  id: string;
  actor: Actor;
  type: string;
  kind: HistoryKind;
  from: string | null;
  to: string | null;
  at: string;
  payload?: Record<string, unknown>;
}

export interface QuoteRequest {
  id: string;
  origin: Origin;
  // Set iff origin is OPEN_REQUEST.
  openRequestId: string | null;
  listingId: string;
  projectId: string;
  producerId: string | null;
  producerName: string;
  buyerId: string;
  buyerName: string;
  quantity: number;
  desiredDeliveryDate: string;
  notes: string;
  status: RequestStatus;
  // The status string exactly as received, kept for diagnostics when status is "UNKNOWN".
  rawStatus: string;
  createdAt: string;
  quotes: SaleQuote[];
  history: HistoryEntry[];
}

// The central entity is a negotiation; QuoteRequest is its original name and stays as the same type.
export type Negotiation = QuoteRequest;
export type Offer = SaleQuote;

// A buyer's request that several producers can answer. Stored statuses are only OPEN | CLOSED;
// everything else (partially awarded, fulfilled, expired) is derived by `openRequestView`.
export interface OpenRequest {
  id: string;
  buyerId: string;
  buyerName: string;
  title: string;
  productionType: string;
  quantity: number;
  unit: ListingUnit;
  rawUnit: string;
  targetUnitPrice: number | null;
  currency: string;
  deliveryDate: string;
  deliveryLocation: string;
  notes: string;
  status: OpenRequestStatus;
  rawStatus: string;
  // Server-derived: sum of the quantities of ACCEPTED negotiations.
  awardedQuantity: number;
  createdAt: string;
}

export type OpenRequestView = "OPEN" | "PARTIALLY_AWARDED" | "FULFILLED" | "EXPIRED" | "CLOSED" | "UNKNOWN";
