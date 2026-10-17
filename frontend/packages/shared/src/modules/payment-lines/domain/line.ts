// Payment line = one direct payment from the investor to one beneficiary (PRD "Split del hito").

export const PAYMENT_MOMENTS = ["insumos", "aprobacion", "liquidacion"] as const;
export type PaymentMoment = (typeof PAYMENT_MOMENTS)[number];

// `imprevisto` can only be spent from the contingency reserve (RF-21); `comision` is the platform commission planned per milestone (D-06).
export const LINE_CONCEPTS = ["factura", "orden", "mano_de_obra", "imprevisto", "comision"] as const;
export type LineConcept = (typeof LINE_CONCEPTS)[number];

export const AMOUNT_MODES = ["fixed", "percent"] as const;
export type AmountMode = (typeof AMOUNT_MODES)[number];

// "desconocido" is the mapper fallback for a wire status this client does not know.
export const LINE_STATUSES = ["pendiente", "completado", "fallido", "en_cola"] as const;
export type KnownLineStatus = (typeof LINE_STATUSES)[number];
export type LineStatus = KnownLineStatus | "desconocido";

export type BeneficiaryRole = "SUPPLIER" | "PRODUCER" | "PLATFORM";

export interface Beneficiary {
  role: BeneficiaryRole;
  id: string;
  name: string;
  walletAddress: string;
}

// The producer is a fixed profile until authentication exists (same id as the presales producer).
export const PRODUCER_BENEFICIARY: Beneficiary = {
  role: "PRODUCER",
  id: "producer-main",
  name: "Agrícola La Esperanza S.A.S.",
  walletAddress: "https://ilp.interledger-test.dev/agricola-la-esperanza",
};

// What the outgoing payment of a paid line looked like (RF-10).
export interface LineReceipt {
  outgoingPaymentId: string;
  incomingPaymentId: string;
  received: number;
  fee: number;
  debited: number;
}

// One entry of the history of a line: attempts, scheduled retries, rejections and the final payment (RF-11).
export const LINE_EVENT_TYPES = ["ATTEMPT_FAILED", "RETRY_SCHEDULED", "RETRIES_EXHAUSTED", "REJECTED", "MANUAL_RETRY", "PAID"] as const;
export type LineEventType = (typeof LINE_EVENT_TYPES)[number] | "UNKNOWN";

export interface LineHistoryEntry {
  at: string;
  type: LineEventType;
  message: string;
  // Raw machine code of the failure (trace area and tooltips only, never primary text).
  code?: string | null;
}

// RF-11: automatic retries only for network or 5xx failures, at most 5 attempts, exponential backoff.
export const MAX_PAYMENT_ATTEMPTS = 5;
export const RETRY_BASE_DELAY_MS = 30_000;
export const retryDelayMs = (attempt: number): number => RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);

export interface PaymentLine {
  id: string;
  milestoneId: string;
  beneficiary: Beneficiary;
  concept: LineConcept;
  // Invoice or order number (F-118, T-07); empty for labor.
  reference: string;
  amountMode: AmountMode;
  // Minimal units when fixed; basis points of the milestone cap (1% = 100) when percent.
  value: number;
  moment: PaymentMoment;
  status: LineStatus;
  receiptId: string | null;
  receipt?: LineReceipt | null;
  createdAt: string;
  // Failed payment attempts so far (RF-11). Absent on lines never attempted.
  attempts?: number;
  // When the engine will try again (only while `en_cola`).
  nextAttemptAt?: string | null;
  history?: LineHistoryEntry[];
}

// Whether the producer can still edit or remove the line. The platform commission is planned by the system and a contingency request
// is made through its own flow: neither is edited by hand.
export const isEditable = (line: Pick<PaymentLine, "status"> & { concept?: LineConcept }): boolean =>
  line.status === "pendiente" && line.concept !== "comision" && line.concept !== "imprevisto";

// Lines the producer can ask the platform to pay again: queued after a transient failure, or failed/rejected.
export const canRetryPayment = (line: Pick<PaymentLine, "status">): boolean => line.status === "en_cola" || line.status === "fallido";

// Lines the producer creates by hand with the general form (the other concepts have their own flow).
export const MANUAL_CONCEPTS = ["factura", "orden", "mano_de_obra"] as const satisfies readonly LineConcept[];

// RF-11: one idempotency key per milestone line, so a retry never creates a second outgoing payment.
export const idempotencyKey = (milestoneId: string, lineId: string): string => `${milestoneId}:${lineId}`;

export const MOMENT_ORDER: Record<PaymentMoment, number> = { insumos: 0, aprobacion: 1, liquidacion: 2 };

// Human text for the raw failure codes the engine records (the code itself stays in `code` for the trace area).
export function failureText(code: string | null | undefined, remainingText?: string): string | null {
  switch (code) {
    case "GRANT_LIMIT_EXCEEDED":
      return remainingText ? `El pago no cabe en el tope que queda del grant (quedan ${remainingText}).` : "El pago no cabe en el tope que queda del grant.";
    case "NETWORK_ERROR":
      return "No se pudo contactar la billetera del beneficiario; se reintentará.";
    case "SERVER_ERROR":
      return "Error temporal del servidor de la billetera.";
    case "PAYMENT_REJECTED":
      return "El pago fue rechazado.";
    default:
      return null;
  }
}

export interface PendingRetry {
  count: number;
  lines: { id: string; concept: LineConcept; reference: string; status: LineStatus; reason: string | null; code: string | null }[];
}

// PRD: a milestone is not closed until every one of its lines is in a final state. These are the lines that are not (queued or failed).
export function pendingRetryOf(lines: readonly PaymentLine[]): PendingRetry {
  const open = lines.filter((l) => canRetryPayment(l));
  return {
    count: open.length,
    lines: open.map((l) => {
      const failure = [...(l.history ?? [])].reverse().find((e) => e.type === "ATTEMPT_FAILED" || e.type === "REJECTED");
      return { id: l.id, concept: l.concept, reference: l.reference, status: l.status, reason: failure?.message ?? null, code: failure?.code ?? null };
    }),
  };
}

export const pendingRetryText = (count: number): string =>
  `${count === 1 ? "Hay 1 pago pendiente de reintento" : `Hay ${count} pagos pendientes de reintento`}. El hito se cerrará cuando todos los pagos estén completados.`;
