import type { FundingCallback } from "../../milestones/ports/milestone-funding";
import type { CaptureQuote, Investment } from "../domain/investment";

/** The investor's wallet as its wallet address document describes it. */
export type InvestorWallet = { id: string; assetCode: string; assetScale: number };

export type CaptureStart =
  /** Open Payments: the investor approves the exact quoted debit at redirectUrl; the wallet then calls complete(). */
  | { kind: "consent"; redirectUrl: string; quote: CaptureQuote; incomingPaymentId: string }
  /** Simulated: the money already moved. */
  | { kind: "captured"; quote: CaptureQuote; incomingPaymentId: string | null; outgoingPaymentId: string };

export type CaptureCompletion =
  | { kind: "captured"; quote: CaptureQuote; outgoingPaymentId: string }
  /** The money did not move; quote is the newest one asked for (RNF-13 records the re-quote even when it is refused). */
  | { kind: "failed"; quote: CaptureQuote; reason: string };

// Abstract class (not interface) so it doubles as the Nest DI token.
// PRD v3 Fase 1 / RF-29: incoming payment on custody for the COP amount, quote with that receiver on the investor's wallet,
// outgoing payment under the investor's approved grant.
export abstract class InvestmentCapture {
  /** Reads the wallet address (asset code and scale); rejects when it cannot be read. */
  abstract wallet(url: string): Promise<InvestorWallet>;
  abstract start(investment: Investment, wallet: InvestorWallet): Promise<CaptureStart>;
  /**
   * Verifies the wallet redirect and moves the money. Rejects (and changes nothing) when the callback cannot be trusted;
   * once the grant is finalized every outcome is returned, failures included, because the consent cannot be replayed.
   */
  abstract complete(investment: Investment, callback: FundingCallback): Promise<CaptureCompletion>;
}
