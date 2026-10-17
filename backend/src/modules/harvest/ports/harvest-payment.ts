import type { FundingCallback } from "../../milestones/ports/milestone-funding";

/** What the buyer pays into the project's custody for a certified harvest: Q·P_g in minor units of currency/assetScale. */
export type HarvestOrder = { projectId: string; amount: number; currency: string; assetScale: number };

// Abstract class (not interface) so it doubles as the Nest DI token.
// PRD v3 Fase 3 paso 3 / RF-24: incoming payment on custody for Q·P_g, interactive grant on the buyer's wallet, quote, outgoing payment.
export abstract class HarvestPayment {
  /** null: the money already moved (simulated); otherwise the buyer approves at redirectUrl and complete() moves it. */
  abstract start(order: HarvestOrder): Promise<{ redirectUrl: string } | null>;
  /** Verifies the wallet redirect and moves the money. Resolves the payment reference; rejects when it cannot be trusted. */
  abstract complete(order: HarvestOrder, callback: FundingCallback): Promise<{ reference: string }>;
}
