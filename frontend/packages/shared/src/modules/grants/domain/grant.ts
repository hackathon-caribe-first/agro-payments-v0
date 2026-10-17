// Domain types for per-milestone investor grants (Open Payments `outgoing-payment` grants).
// The platform never holds the money: the investor approves a spending permission capped at the milestone budget and the
// funds stay in the investor wallet. Amounts are integer minor units (RNF-10).

export const GRANT_STATUSES = ["PENDING_APPROVAL", "ACTIVE", "REVOKED", "DENIED", "EXPIRED"] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number] | "UNKNOWN";

// State of the GNAP interaction hash (RF-06): nothing received yet, verified, or rejected.
export const HASH_STATES = ["PENDING", "VERIFIED", "MISMATCH"] as const;
export type HashState = (typeof HASH_STATES)[number] | "UNKNOWN";

// The four cases in which a grant is revoked (grant rule 4).
export const REVOCATION_REASONS = ["LAST_LINE_CONFIRMED", "MILESTONE_CANCELLED", "DEADLINE_EXPIRED", "SECURITY_INCIDENT"] as const;
export type RevocationReason = (typeof REVOCATION_REASONS)[number] | "UNKNOWN";

export const GRANT_EVENT_TYPES = [
  "REQUESTED",
  "APPROVAL_RECEIVED",
  "HASH_VERIFIED",
  "HASH_MISMATCH",
  "TOKEN_STORED",
  "DENIED",
  "TOKEN_ROTATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_REJECTED",
  // A transient failure (network or 5xx) of the wallet: nothing was paid and the payment is retried (RF-11).
  "PAYMENT_FAILED",
  "REVOKED",
  "REVOCATION_VERIFIED",
] as const;
export type GrantEventType = (typeof GRANT_EVENT_TYPES)[number] | "UNKNOWN";

export const GRANT_ACTORS = ["INVESTOR", "PLATFORM", "WALLET"] as const;
export type GrantActor = (typeof GRANT_ACTORS)[number] | "UNKNOWN";

// Closing receipt written to the audit trail when the grant is cancelled (grant rule 5).
export interface RevocationProof {
  cap: number;
  spent: number;
  // What never left the investor wallet.
  remainingInWallet: number;
  // HTTP status answered by the DELETE on the continue URI.
  deleteResponseStatus: number;
}

export interface MilestoneGrant {
  id: string;
  projectId: string;
  milestoneId: string;
  investorId: string;
  wallet: string;
  // Milestone budget, commission margin included. Applies to the whole life of the grant (no interval).
  capAmount: number;
  currency: string;
  spent: number;
  status: GrantStatus;
  interactRef: string | null;
  hashState: HashState;
  // Only a trimmed token is ever shown (RNF-02).
  tokenMasked: string | null;
  createdAt: string;
  approvedAt: string | null;
  revokedAt: string | null;
  revocationReason: RevocationReason | null;
  revocation: RevocationProof | null;
}

// Append-only audit record (RNF-06): date, actor and cause.
export interface GrantEvent {
  id: string;
  grantId: string;
  type: GrantEventType;
  actor: GrantActor;
  at: string;
  detail: Record<string, string | number | boolean | null>;
}

// Payment receipt of one split line (RF-15).
export interface GrantSpendEvent {
  id: string;
  grantId: string;
  // `milestone:line`
  idempotencyKey: string;
  lineId: string;
  concept: string;
  beneficiary: string;
  beneficiaryWallet: string;
  received: number;
  fee: number;
  debited: number;
  spentBefore: number;
  spentAfter: number;
  incomingPaymentId: string;
  outgoingPaymentId: string;
  createdAt: string;
}

export interface GrantProjectRef {
  id: string;
  title: string;
  currency: string;
}

export interface GrantMilestoneRef {
  id: string;
  sequenceOrder: number;
  title: string;
  // Raw milestone status of the milestones module.
  status: string;
  // Milestone budget = cap of its grant.
  budget: number;
  estimatedCompletionDate: string | null;
}

// A grant with the names needed to list it.
export interface GrantView {
  grant: MilestoneGrant;
  project: GrantProjectRef;
  milestone: GrantMilestoneRef;
}

export interface InvestorGrantsView {
  grants: GrantView[];
  projects: GrantProjectRef[];
}

export interface ProjectGrantsView {
  project: GrantProjectRef;
  milestones: GrantMilestoneRef[];
  grants: MilestoneGrant[];
}

export interface GrantDetail extends GrantView {
  events: GrantEvent[];
  receipts: GrantSpendEvent[];
}

// Result of POST /grants/:id/spend. `replayed` is true when the idempotency key already had a receipt.
export interface SpendResult {
  receipt: GrantSpendEvent;
  replayed: boolean;
}

// Wallet answer to the consent step: what comes back on the redirect.
export interface WalletConsent {
  interactRef: string;
  hash: string;
}
