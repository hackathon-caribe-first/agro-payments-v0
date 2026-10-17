// Test double for the payment step timeline: the Postgres adapter's semantics (first row per step wins) without a database.
import { PaymentStepRepository, type PaymentStepQuery } from "../ports/payment-step.repository";
import type { PaymentStep } from "./payment-step";

export class InMemoryPaymentSteps extends PaymentStepRepository {
  readonly rows: PaymentStep[] = [];
  private tick = 0;

  async record(step: Omit<PaymentStep, "at">) {
    if (this.rows.some((r) => r.kind === step.kind && r.paymentId === step.paymentId && r.step === step.step)) return;
    this.rows.push({ ...step, at: new Date(Date.UTC(2026, 9, 17, 12, 0, this.tick++)) });
  }

  async list({ projectId, paymentKind, paymentId, limit }: PaymentStepQuery) {
    return this.rows
      .filter((r) => (projectId === undefined || r.projectId === projectId) && (paymentKind === undefined || r.kind === paymentKind) && (paymentId === undefined || r.paymentId === paymentId))
      .slice(0, limit);
  }

  /** The step names of one payment, in the order they were recorded. */
  of(kind: string, paymentId: string) {
    return this.rows.filter((r) => r.kind === kind && r.paymentId === paymentId).map((r) => r.step);
  }
}
