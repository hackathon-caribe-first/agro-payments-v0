import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import type { PaymentLinesError } from "@agro/shared/modules/payment-lines/domain/errors";
import type { AmountMode, LineConcept, LineEventType, PaymentLine, PaymentMoment } from "@agro/shared/modules/payment-lines/domain/line";
import { formatBps, formatAmount } from "@agro/shared/modules/payment-lines/domain/money";
import type { SplitContext } from "@agro/shared/modules/payment-lines/domain/split";
import type { SupplierCategory } from "@agro/shared/modules/payment-lines/domain/supplier";

// `intent` tells the page which of its forms the answer belongs to.
export type SplitActionData = { fieldErrors: FieldErrors; intent?: string };

export const MOMENT_LABELS: Record<PaymentMoment, string> = {
  insumos: "Insumos",
  aprobacion: "Aprobación",
  liquidacion: "Liquidación",
};

export const MOMENT_HINTS: Record<PaymentMoment, string> = {
  insumos: "Se paga al cargar la factura u orden, antes de ejecutar el hito.",
  aprobacion: "Se paga cuando el verificador aprueba el hito.",
  liquidacion: "Se paga al liquidar la venta de la cosecha.",
};

export const CONCEPT_LABELS: Record<LineConcept, string> = {
  factura: "Factura",
  orden: "Orden",
  mano_de_obra: "Mano de obra",
  imprevisto: "Imprevisto",
  comision: "Comisión de la plataforma",
};

export const BENEFICIARY_ROLE_LABELS = { PRODUCER: "Productor", SUPPLIER: "Proveedor", PLATFORM: "Plataforma" } as const;

export const LINE_EVENT_LABELS: Record<LineEventType, string> = {
  ATTEMPT_FAILED: "Intento fallido",
  RETRY_SCHEDULED: "Reintento programado",
  RETRIES_EXHAUSTED: "Reintentos agotados",
  REJECTED: "Pago rechazado",
  MANUAL_RETRY: "Reintento manual",
  PAID: "Pago confirmado",
  UNKNOWN: "Evento registrado",
};

export const MODE_LABELS: Record<AmountMode, string> = {
  fixed: "Monto fijo",
  percent: "Porcentaje del tope",
};

export const CATEGORY_LABELS: Record<SupplierCategory, string> = {
  insumos: "Insumos agrícolas",
  transporte: "Transporte",
  maquinaria: "Maquinaria",
  servicios_tecnicos: "Servicios técnicos",
  otro: "Otro",
};

// "https://ilp.interledger-test.dev/agroinsumos-huila" -> "ilp.interledger-test.dev/agroinsumos-huila"
export const shortWallet = (url: string) => url.replace(/^https:\/\//, "");

export const money = (ctx: Pick<SplitContext, "currency" | "scale">, amount: number) => formatAmount(amount, ctx.currency, ctx.scale);

// A percent line shows its share; a fixed one its amount.
export const lineAmountText = (ctx: Pick<SplitContext, "currency" | "scale">, line: Pick<PaymentLine, "amountMode" | "value">) =>
  line.amountMode === "percent" ? `${formatBps(line.value)} del tope` : money(ctx, line.value);

export function splitErrorMessage(error: PaymentLinesError): string {
  switch (error.kind) {
    case "not_found":
      return "No encontramos este registro.";
    case "validation":
      return "Revisa los campos marcados e intenta de nuevo.";
    case "boundary":
      return "Recibimos datos con un formato inesperado. Intenta de nuevo en unos minutos.";
    case "network":
      return "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
    case "line_locked":
      return "Solo se pueden editar o quitar líneas pendientes.";
  }
}

export function toSplitActionData(error: PaymentLinesError): SplitActionData {
  if (error.kind === "validation") return { fieldErrors: error.fieldErrors };
  return { fieldErrors: { [FORM_LEVEL_KEY]: [splitErrorMessage(error)] } };
}
