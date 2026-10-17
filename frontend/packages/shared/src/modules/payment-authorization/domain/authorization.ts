// Domain types for payment authorizations. The platform never holds the money: the buyer authorizes a grant capped at
// the full project quotation total, and the funds stay in the buyer wallet until reception is confirmed.

export const PAYMENT_AUTHORIZATION_STATUSES = ["AUTHORIZED", "REVOKED"] as const;
// A project agreement is first PENDING (agreed, not yet authorized) and then AUTHORIZED. No state means no agreement.
export const AUTHORIZATION_STATES = ["PENDING", "AUTHORIZED"] as const;

// Values added by a newer server map to "UNKNOWN" so they degrade instead of crashing.
export type PaymentAuthorizationStatus = (typeof PAYMENT_AUTHORIZATION_STATUSES)[number] | "UNKNOWN";
export type AuthorizationStatus = (typeof AUTHORIZATION_STATES)[number] | "UNKNOWN";

export interface PaymentAuthorization {
  id: string;
  negotiationId: string;
  projectId: string;
  buyerId: string;
  // Maximum the platform may pay out of the buyer wallet (the agreed project total).
  cap: number;
  // Already paid against the cap.
  spent: number;
  currency: string;
  status: PaymentAuthorizationStatus;
  createdAt: string;
  revokedAt: string | null;
}
