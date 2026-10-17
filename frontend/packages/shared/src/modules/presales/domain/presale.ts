import type { Project } from "../../projects/domain/project";
import type { DepositStatus } from "../../escrow/domain/ledger";

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
export const KNOWN_REQUEST_STATUSES = ["REQUESTED", "QUOTED", "NEGOTIATING", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"] as const;
export const KNOWN_QUOTE_STATUSES = ["SENT", "ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED", "WITHDRAWN"] as const;
export const KNOWN_OPEN_REQUEST_STATUSES = ["OPEN", "CLOSED"] as const;

// Where a negotiation started: the buyer approached a project, or a producer answered a buyer's open request.
export const ORIGINS = ["PROJECT_INTEREST", "OPEN_REQUEST"] as const;
// Event kinds of the append-only history. STATUS_CHANGED is the legacy generic kind.
export const HISTORY_KINDS = [
  "REQUESTED",
  "STATUS_CHANGED",
  "OFFER",
  "COUNTER_OFFER",
  "ACCEPT",
  "REJECT",
  "WITHDRAW",
  "EXPIRE",
  "AUTO_CLOSE",
  "DEPOSIT",
] as const;
// What a project negotiation is about: the whole project or one of its milestones.
export const NEGOTIATION_SCOPES = ["PROJECT", "MILESTONE"] as const;

export type RequestStatus = (typeof KNOWN_REQUEST_STATUSES)[number] | "UNKNOWN";
export type QuoteStatus = (typeof KNOWN_QUOTE_STATUSES)[number] | "UNKNOWN";
export type OpenRequestStatus = (typeof KNOWN_OPEN_REQUEST_STATUSES)[number] | "UNKNOWN";
export type Origin = (typeof ORIGINS)[number] | "UNKNOWN";
export type HistoryKind = (typeof HISTORY_KINDS)[number] | "UNKNOWN";
export type NegotiationScope = (typeof NEGOTIATION_SCOPES)[number] | "UNKNOWN";

// The terms of one offer, by kind. SALE is the open-request (Flow B) shape; PROJECT and MILESTONE are the project negotiation.
export type OfferTerms =
  | { kind: "SALE"; quantity: number; unitPrice: number; deliveryDate: string | null; validUntil: string | null; deliveryTerms: string }
  | {
      kind: "PROJECT";
      quantity: number;
      unit: ListingUnit;
      rawUnit: string;
      unitPrice: number;
      deliveryDate: string;
      validUntil: string;
      notes: string;
    }
  // A lump-sum price for one milestone. It carries no validity: milestone offers never expire.
  | { kind: "MILESTONE"; price: number; deliveryDate: string; notes: string };

export interface DepositState {
  status: DepositStatus;
  agreedTotal: number;
  depositedAt: string | null;
  ledgerEntryId: string | null;
}

// Keyed by (requestId, revision). Each counter-offer is a new revision; only the latest can be SENT.
export interface SaleQuote {
  requestId: string;
  revision: number;
  author: Actor;
  // Unit chosen by the buyer on a PROJECT offer; null elsewhere.
  unit: ListingUnit | null;
  rawUnit: string;
  notes: string;
  terms: OfferTerms;
  unitPrice: number;
  quantity: number;
  total: number;
  currency: string;
  deliveryDate: string | null;
  // Null on MILESTONE offers, which never expire.
  validUntil: string | null;
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
  // PROJECT or MILESTONE for project negotiations; null for open-request negotiations.
  scope: NegotiationScope | null;
  // Set iff scope is MILESTONE.
  milestoneId: string | null;
  // The thing being negotiated: the milestone when there is one, else the project.
  targetId: string;
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
  // Present on an agreed PROJECT negotiation: the frozen total and its deposit state.
  deposit: DepositState | null;
  // Set only on the answer to a deposit (or buyer accept) that needs the buyer's wallet approval first.
  depositRedirectUrl?: string;
}

// A project as the buyer sees it in the catalog: the project plus its producer and server-derived locks.
export interface CatalogProject {
  project: Project;
  producerId: string | null;
  producerName: string;
  // True once a PROJECT agreement exists: nothing else can be negotiated on the project.
  negotiationLocked: boolean;
  // Milestones that already have an agreed MILESTONE negotiation.
  agreedMilestoneIds: string[];
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
