import type { Milestone } from "../application/milestone";

/** What the custody wallet's consent page sends back to the finish URI. */
export type FundingCallback = { interactRef: string; hash: string | null };

// Abstract class (not interface) so it doubles as the Nest DI token.
// v3: the fiduciaria approves one outgoing-payment grant per milestone on the custody wallet, capped at its amount; every line is paid from it.
export abstract class MilestoneFunding {
  /** Starts the wallet consent; the browser must be sent to redirectUrl. */
  abstract start(milestone: Milestone): Promise<{ redirectUrl: string }>;
  /** Verifies the wallet redirect and finalizes the grant. Rejects when it cannot be trusted. */
  abstract complete(milestoneId: string, params: FundingCallback): Promise<void>;
  /** RF-22: cancels the grant of a milestone closed after approval. Idempotent: no grant or an already revoked one is a no-op. */
  abstract revoke(milestoneId: string): Promise<void>;
}
