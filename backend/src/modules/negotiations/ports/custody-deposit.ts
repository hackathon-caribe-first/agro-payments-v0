import type { FundingCallback } from "../../milestones/ports/milestone-funding";

/** What the buyer must move into the project's custody: amount in integer minor units of currency/assetScale. */
export type DepositOrder = {
  negotiationId: string;
  projectId: string;
  amount: number;
  currency: string;
  assetScale: number;
  /** The buyer wallet agreed in the project's purchase contract; the deployment's OP_BUYER_WALLET_ADDRESS is the fallback. */
  buyerWalletAddress?: string | null;
};

/** reference: the outgoing payment that moved (or is moving) the money. */
export type DepositResult = { status: "completed" | "unconfirmed"; reference: string };

// Abstract class (not interface) so it doubles as the Nest DI token.
// PRD v3: the buyer's deposit of an agreed PROJECT negotiation lands in the custody wallet.
export abstract class CustodyDeposit {
  /** null: the money already moved (simulated); otherwise the buyer approves at redirectUrl and complete() moves it. */
  abstract start(order: DepositOrder): Promise<{ redirectUrl: string } | null>;
  /**
   * Verifies the wallet redirect, moves the money and waits (bounded) for it to land. Rejects when it cannot be trusted or the
   * payment failed; resolves "unconfirmed" when it was sent but did not land yet: confirm() resolves it later. Credit only "completed".
   */
  abstract complete(order: DepositOrder, callback: FundingCallback): Promise<DepositResult>;
  /** Re-reads a payment complete() left unconfirmed. null: nothing in flight (never sent, or it failed), so the deposit may start again. */
  abstract confirm(order: DepositOrder): Promise<DepositResult | null>;
}
