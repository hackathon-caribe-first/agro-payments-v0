import type { FundingCallback } from "../../milestones/ports/milestone-funding";
import type { Settlement } from "../application/settlement";

// Abstract class (not interface) so it doubles as the Nest DI token.
// PRD v3 Fase 3 paso 5 / RF-26: the fiduciaria approves one interactive outgoing grant on the custody wallet for the cascade,
// capped at the sum of its COP payouts; every payout is paid from it. Simulated mode has nothing to approve.
export abstract class LiquidationFunding {
  /** False in simulated mode: there is no wallet consent, payouts run as soon as the settlement is approved. */
  abstract readonly interactive: boolean;
  /** Starts the wallet consent; the browser must be sent to redirectUrl. */
  abstract start(settlement: Settlement): Promise<{ redirectUrl: string }>;
  /** Verifies the wallet redirect and finalizes the grant. Rejects when it cannot be trusted. */
  abstract complete(settlementId: string, params: FundingCallback): Promise<void>;
  /** Whether payouts may run: an active liquidation grant exists (always true in simulated mode). */
  abstract ready(settlementId: string): Promise<boolean>;
  /** Cancels the grant once the settlement is executed. Idempotent. */
  abstract revoke(settlementId: string): Promise<void>;
}
