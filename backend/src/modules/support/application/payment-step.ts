// Append-only lifecycle of every payment, one row per step (migration SupportPaymentSteps1792800000000). Pure: no Nest, no I/O.
import type { PaymentStepRepository } from "../ports/payment-step.repository";

export const PAYMENT_KIND = {
  MILESTONE_LINE: "milestone_line",
  SETTLEMENT_PAYOUT: "settlement_payout",
  BUYER_DEPOSIT: "buyer_deposit",
  INVESTMENT_CAPTURE: "investment_capture",
  HARVEST_PAYMENT: "harvest_payment",
  INSURANCE_PREMIUM: "insurance_premium",
} as const;
export type PaymentKind = (typeof PAYMENT_KIND)[keyof typeof PAYMENT_KIND];

export const PAYMENT_STEP = {
  GRANT_REQUESTED: "grant_requested",
  GRANT_APPROVED: "grant_approved",
  INCOMING_CREATED: "incoming_created",
  QUOTE_CREATED: "quote_created",
  OUTGOING_CREATED: "outgoing_created",
  SENT_UNCONFIRMED: "sent_unconfirmed",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export type PaymentStepName = (typeof PAYMENT_STEP)[keyof typeof PAYMENT_STEP];

/** Which payment a step belongs to. paymentId is unique within its kind. */
export type PaymentTarget = { kind: PaymentKind; paymentId: string; projectId: string | null };

export type PaymentStep = PaymentTarget & {
  step: PaymentStepName;
  /** The Open Payments resource of that step (incoming payment, quote, outgoing payment, grant); null when simulated. */
  opUrl: string | null;
  detail: Record<string, unknown> | null;
  /** Set by the database (clock_timestamp()) on insert. */
  at: Date;
};

/** Simulated ids (SIM-…) are not Open Payments resources. */
export const opUrlOf = (id: string | null | undefined) => (id && /^https?:\/\//.test(id) ? id : null);

/** Records steps of one payment; a no-op without a repository (specs, modules that do not wire it). */
export const stepRecorder =
  (steps: PaymentStepRepository | undefined, target: PaymentTarget) =>
  async (step: PaymentStepName, opUrl: string | null = null, detail: Record<string, unknown> | null = null) => {
    await steps?.record({ ...target, step, opUrl: opUrlOf(opUrl), detail });
  };
export type StepRecorder = ReturnType<typeof stepRecorder>;

type StepAmount = { value: number | string; assetCode: string; assetScale: number };

/** The quote's sides as the step's detail (Open Payments shape), so the receipt can show the amount and the wallet's FX rate. */
export const quoteDetail = (debitAmount?: StepAmount | null, receiveAmount?: StepAmount | null): Record<string, unknown> | null =>
  debitAmount || receiveAmount ? { debitAmount: debitAmount ?? null, receiveAmount: receiveAmount ?? null } : null;

type GatewayResult = {
  status: "en_cola" | "completado" | "fallido";
  receipt?: {
    incomingPaymentId?: string | null;
    quoteId?: string | null;
    outgoingPaymentId?: string | null;
    debitAmount?: StepAmount | null;
    receiveAmount?: StepAmount | null;
  };
};

/**
 * The steps a PaymentGateway result proves (milestone lines, settlement payouts, the premium): what its receipt names was created,
 * then completed or failed. Called after every pay() and check(); steps already recorded are left as they are.
 */
export async function recordGatewayResult(steps: PaymentStepRepository | undefined, target: PaymentTarget, result: GatewayResult) {
  const record = stepRecorder(steps, target);
  const receipt = result.receipt ?? {};
  if (receipt.incomingPaymentId) await record(PAYMENT_STEP.INCOMING_CREATED, receipt.incomingPaymentId);
  if (receipt.quoteId) await record(PAYMENT_STEP.QUOTE_CREATED, receipt.quoteId, quoteDetail(receipt.debitAmount, receipt.receiveAmount));
  if (receipt.outgoingPaymentId) await record(PAYMENT_STEP.OUTGOING_CREATED, receipt.outgoingPaymentId);
  if (result.status === "completado") await record(PAYMENT_STEP.COMPLETED, receipt.outgoingPaymentId ?? null);
  if (result.status === "fallido") await record(PAYMENT_STEP.FAILED, receipt.outgoingPaymentId ?? null);
}
