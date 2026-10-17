import type { FundingCallback } from "../../milestones/ports/milestone-funding";

export type PremiumOrder = { projectId: string; amount: number; currency: string; assetScale: number };

// Abstract class (not interface) so it doubles as the Nest DI token.
// RF-14 / Fase 1 paso 6: the fiduciaria approves one interactive outgoing grant on the custody wallet capped at the net premium
// (the liquidation-grant pattern); the premium is paid from it. Simulated mode has nothing to approve.
export abstract class PremiumFunding {
  /** False in simulated mode: the premium is paid as soon as it is asked for. */
  abstract readonly interactive: boolean;
  /** Starts the wallet consent; the browser must be sent to redirectUrl. */
  abstract start(order: PremiumOrder): Promise<{ redirectUrl: string }>;
  /** Verifies the wallet redirect and finalizes the grant. Rejects when it cannot be trusted. */
  abstract complete(projectId: string, params: FundingCallback): Promise<void>;
  /** Whether the premium may be paid: an active premium grant exists (always true in simulated mode). */
  abstract ready(projectId: string): Promise<boolean>;
  /** Cancels the grant once the premium is paid. Idempotent. */
  abstract revoke(projectId: string): Promise<void>;
}
