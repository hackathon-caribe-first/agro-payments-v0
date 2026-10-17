import type { Milestone } from "../application/milestone";

/** What the investor's wallet sends back to the finish URI after consent. */
export type FundingCallback = { interactRef: string; hash: string | null };

// Abstract class (not interface) so it doubles as the Nest DI token.
// The investor approves one outgoing-payment grant per milestone, capped at its amount; every line is paid from it.
export abstract class MilestoneFunding {
  /** Starts the wallet consent; the browser must be sent to redirectUrl. */
  abstract start(milestone: Milestone): Promise<{ redirectUrl: string }>;
  /** Verifies the wallet redirect and finalizes the grant. Rejects when it cannot be trusted. */
  abstract complete(milestoneId: string, params: FundingCallback): Promise<void>;
}
