import type { LineResult } from "../application/milestone";

export type LinePaymentRequest = {
  milestoneId: string;
  lineId: string;
  walletAddress: string;
  /** Integer minor units */
  amount: number;
  currency: string;
  assetScale: number;
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
