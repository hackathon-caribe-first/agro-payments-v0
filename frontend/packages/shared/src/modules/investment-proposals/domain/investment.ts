import type { Project } from "../../projects/domain/project";

// Domain types for investments (PRD phase 1, investor side): the catalog the investor browses, the investment
// proposals negotiated with the producer, and the contract generated once a proposal is accepted.
// Naming mirrors the presales engine on purpose (turns, revisions, SUPERSEDED, lazy expiry) but lives on its own.

export const ACTORS = ["INVESTOR", "PRODUCER", "SYSTEM"] as const;
export type Actor = (typeof ACTORS)[number] | "UNKNOWN";
// The two sides that can act on a proposal or sign a contract.
export type Party = "INVESTOR" | "PRODUCER";

// Statuses cross the wire as free strings. Anything not listed maps to "UNKNOWN" so newer servers degrade instead of crashing.
export const KNOWN_PROPOSAL_STATUSES = ["PROPOSED", "NEGOTIATING", "ACCEPTED", "REJECTED", "WITHDRAWN", "EXPIRED"] as const;
export const KNOWN_REVISION_STATUSES = ["SENT", "ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED", "WITHDRAWN"] as const;
export const KNOWN_CONTRACT_STATUSES = ["PENDING_SIGNATURES", "SIGNED"] as const;
export const HISTORY_KINDS = [
  "PROPOSED",
  "COUNTER_OFFER",
  "ACCEPT",
  "REJECT",
  "WITHDRAW",
  "EXPIRE",
  "AUTO_CLOSE",
  "CONTRACT_GENERATED",
  "CONTRACT_SIGNED",
] as const;

export type ProposalStatus = (typeof KNOWN_PROPOSAL_STATUSES)[number] | "UNKNOWN";
export type RevisionStatus = (typeof KNOWN_REVISION_STATUSES)[number] | "UNKNOWN";
export type ContractStatus = (typeof KNOWN_CONTRACT_STATUSES)[number] | "UNKNOWN";
export type HistoryKind = (typeof HISTORY_KINDS)[number] | "UNKNOWN";

// ---- catalog ----

export interface CatalogMilestone {
  id: string;
  sequenceOrder: number;
  title: string;
  description: string;
  dueDate: string | null;
  suppliesBudget: number;
  laborBudget: number;
  // The milestone cap (tope): supplies + labor budget.
  budget: number;
}

// A project as the investor sees it: the project, its producer, its milestones and the server-derived lock.
export interface CatalogProject {
  project: Project;
  producerId: string;
  producerName: string;
  milestones: CatalogMilestone[];
  // Sum of the milestone budgets (the project quotation total, with no buyer-agreed prices).
  quotationTotal: number;
  // True once a proposal on the project was accepted: no further proposals are admitted.
  contractLocked: boolean;
}

// ---- proposals ----

// One round. Keyed by (proposalId, revision); each counter-offer is a new revision and only the latest can be SENT.
export interface ProposalRevision {
  proposalId: string;
  revision: number;
  author: Actor;
  // COP, integer.
  amount: number;
  // Agreed yield in basis points (1 bp = 0.01 %), integer: 1450 = 14,5 %.
  yieldBps: number;
  validUntil: string;
  notes: string;
  currency: string;
  status: RevisionStatus;
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

export interface Proposal {
  id: string;
  projectId: string;
  projectTitle: string;
  // Project quotation total when the proposal was made: the ceiling of every amount in the negotiation.
  projectTotal: number;
  investorId: string;
  investorName: string;
  producerId: string;
  producerName: string;
  currency: string;
  status: ProposalStatus;
  // The status string exactly as received, kept for diagnostics when status is "UNKNOWN".
  rawStatus: string;
  createdAt: string;
  revisions: ProposalRevision[];
  history: HistoryEntry[];
  // Set once the proposal was accepted and the contract generated.
  contractId: string | null;
}

// ---- contract ----

export interface ContractMilestone {
  id: string;
  sequenceOrder: number;
  title: string;
  // The milestone cap (tope) from the project.
  cap: number;
  dueDate: string | null;
}

export interface Signature {
  signedAt: string;
  signerName: string;
}

export interface Contract {
  id: string;
  proposalId: string;
  projectId: string;
  projectTitle: string;
  projectCode: string;
  currency: string;
  investorId: string;
  investorName: string;
  producerId: string;
  producerName: string;
  // Agreed terms (the accepted revision).
  amount: number;
  yieldBps: number;
  platformFeePct: number;
  projectTotal: number;
  startDate: string;
  estimatedEndDate: string;
  milestones: ContractMilestone[];
  // SHA-256 (hex) of the contract document generated from the template.
  documentHash: string;
  status: ContractStatus;
  rawStatus: string;
  createdAt: string;
  investorSignature: Signature | null;
  producerSignature: Signature | null;
  // Set when the second signature lands.
  signedAt: string | null;
}
