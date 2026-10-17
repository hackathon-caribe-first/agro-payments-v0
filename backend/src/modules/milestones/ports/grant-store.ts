// Outgoing-payment grants on a payer wallet (v3: the project's custody wallet).
// One aggregate for every purpose, so later grants (investor capture, buyer, liquidation) reuse the same store.

export const GRANT_PURPOSE = {
  MILESTONE: "milestone",
  // Planned in v3, not issued yet: "capture" | "buyer" | "liquidation".
} as const;
export type GrantPurpose = (typeof GRANT_PURPOSE)[keyof typeof GRANT_PURPOSE];

export const GRANT_STATUS = { PENDING: "pending", ACTIVE: "active", REVOKED: "revoked" } as const;
export type GrantStatus = (typeof GRANT_STATUS)[keyof typeof GRANT_STATUS];

/** Interactive grant waiting for consent: what verifies the finish hash and continues it. */
export interface GrantPending {
  clientNonce: string;
  finishNonce: string;
  continueUri: string;
  continueToken: string;
  /** Grant endpoint the finish hash is computed over. */
  authServer: string;
}

/** Finalized grant: the access token pays, the continue URI and token revoke it. */
export interface GrantAccess {
  accessToken: string;
  manageUrl: string;
  continueUri: string;
  continueToken: string;
}

export interface Grant {
  id: string;
  purpose: GrantPurpose;
  /** ponytail: null until projects exist. */
  projectId: string | null;
  milestoneId: string | null;
  payerWalletAddress: string;
  assetCode: string;
  assetScale: number;
  /** debitAmount limit in integer minor units of assetCode/assetScale. */
  debitLimit: number;
  status: GrantStatus;
  /** Set while pending; cleared once finalized. */
  pending: GrantPending | null;
  /** Set once active; kept after revocation for the audit trail. */
  access: GrantAccess | null;
  createdAt: Date;
  revokedAt: Date | null;
}

// Abstract class (not interface) so it doubles as the Nest DI token.
// Holds grant secrets: adapters keep tokens and nonces encrypted at rest, and nothing may log them or return them through the API.
export abstract class GrantStore {
  /** Inserts or replaces the grant by id. */
  abstract save(grant: Grant): Promise<void>;
  /** The newest milestone-purpose grant of that milestone, whatever its status. */
  abstract findLatestForMilestone(milestoneId: string): Promise<Grant | null>;
}
