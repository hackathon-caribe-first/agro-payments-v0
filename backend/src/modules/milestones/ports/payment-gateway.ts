import type { LineResult } from "../application/milestone";

export type LinePaymentRequest = {
  milestoneId: string;
  lineId: string;
  walletAddress: string;
  /** Integer minor units */
  amount: number;
  currency: string;
  assetScale: number;
  /**
   * Settlement payouts to a wallet in another currency (PRD v3 RF-26): `amount` is a fixed debit from custody in
   * `currency`, and the receiver gets whatever the quote converts it to, fees included. Absent: `amount` is what the receiver gets.
   */
  fixedDebitAmount?: boolean;
};

/** Status, reference and what the gateway knows of the receipt so far (RF-23). */
export type LinePaymentResult = LineResult;

// Abstract class (not interface) so it doubles as the Nest DI token.
// Hides grant timing: pay() may answer en_cola and check() resolves it later (no webhooks to rely on).
export abstract class PaymentGateway {
  /** `${milestoneId}:${lineId}` is the idempotency key. */
  abstract pay(request: LinePaymentRequest): Promise<LinePaymentResult>;
  abstract check(reference: string): Promise<LinePaymentResult>;
}
