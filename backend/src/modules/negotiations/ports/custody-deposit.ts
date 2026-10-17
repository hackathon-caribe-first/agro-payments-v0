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

// Abstract class (not interface) so it doubles as the Nest DI token.
// PRD v3: the buyer's deposit of an agreed PROJECT negotiation lands in the custody wallet.
export abstract class CustodyDeposit {
  /** null: the money already moved (simulated); otherwise the buyer approves at redirectUrl and complete() moves it. */
  abstract start(order: DepositOrder): Promise<{ redirectUrl: string } | null>;
  /** Verifies the wallet redirect and moves the money. Resolves the payment reference; rejects when it cannot be trusted. */
  abstract complete(order: DepositOrder, callback: FundingCallback): Promise<{ reference: string }>;
}
