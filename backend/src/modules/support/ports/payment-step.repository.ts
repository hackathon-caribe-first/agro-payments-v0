import type { PaymentStep } from "../application/payment-step";

export type PaymentStepQuery = { projectId?: string; paymentKind?: string; paymentId?: string; limit: number };

// Append-only payment timeline. Abstract class (not interface) so it doubles as the Nest DI token.
// Unlike OpTraceRepository, callers await record(): a step that cannot be written fails the call instead of vanishing.
export abstract class PaymentStepRepository {
  /** Idempotent: a step already recorded for that payment keeps its first row. */
  abstract record(step: Omit<PaymentStep, "at">): Promise<void>;
  /** Oldest first. */
  abstract list(query: PaymentStepQuery): Promise<PaymentStep[]>;
}
