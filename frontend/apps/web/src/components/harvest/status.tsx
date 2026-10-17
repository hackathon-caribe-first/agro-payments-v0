import type { GrantState, HarvestStatus, LineState, OrderStatus, PurchaseOrder } from "@agro/shared/modules/harvest-batches/domain/harvest";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { StatusBadge } from "@agro/shared/ui/status-badge";

type Label = { label: string; tone: Tone; symbol: string };

const HARVEST: Record<HarvestStatus, Label> = {
  DECLARED_BY_PRODUCER: { label: "Pendiente de certificación", tone: "warning", symbol: "◷" },
  CORRECTIONS_REQUESTED: { label: "Correcciones solicitadas", tone: "danger", symbol: "✕" },
  CERTIFIED_LISTED: { label: "Certificado y publicado", tone: "success", symbol: "✓" },
  SOLD_OUT: { label: "Lote vendido", tone: "neutral", symbol: "○" },
  UNKNOWN: { label: "Estado desconocido", tone: "neutral", symbol: "○" },
};

const ORDER: Record<OrderStatus, Label> = {
  AWAITING_PAYMENT_AUTHORIZATION: { label: "Falta autorizar el pago", tone: "warning", symbol: "◷" },
  PAYMENT_AUTHORIZED: { label: "Pago autorizado", tone: "neutral", symbol: "○" },
  DISPATCHED: { label: "Despachada", tone: "warning", symbol: "◷" },
  RECEIVED_CONFIRMED: { label: "Recepción confirmada", tone: "warning", symbol: "◷" },
  SETTLED: { label: "Liquidada", tone: "success", symbol: "✓" },
  CANCELLED: { label: "Cancelada", tone: "neutral", symbol: "○" },
  UNKNOWN: { label: "Estado desconocido", tone: "neutral", symbol: "○" },
};

const GRANT: Record<GrantState, Label> = {
  NONE: { label: "Sin autorización", tone: "neutral", symbol: "○" },
  LIVE: { label: "Autorización vigente", tone: "success", symbol: "✓" },
  REVOKED_BY_BUYER: { label: "Autorización revocada", tone: "danger", symbol: "✕" },
  REVOKED_AFTER_SETTLEMENT: { label: "Autorización cerrada tras la liquidación", tone: "neutral", symbol: "○" },
  UNKNOWN: { label: "Autorización desconocida", tone: "neutral", symbol: "○" },
};

const LINE: Record<LineState, Label> = {
  pendiente: { label: "Pendiente", tone: "warning", symbol: "◷" },
  completado: { label: "Completado", tone: "success", symbol: "✓" },
  fallido: { label: "Fallido", tone: "danger", symbol: "✕" },
  en_cola: { label: "En cola", tone: "warning", symbol: "◷" },
  desconocido: { label: "Sin estado", tone: "neutral", symbol: "○" },
};

export const HarvestStatusBadge = ({ status }: { status: HarvestStatus }) => <StatusBadge {...HARVEST[status]} />;
export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <StatusBadge {...ORDER[status]} />;
export const GrantBadge = ({ state }: { state: GrantState }) => <StatusBadge {...GRANT[state]} />;
export const LineStateBadge = ({ state }: { state: LineState }) => <StatusBadge {...LINE[state]} />;

// Order status for lists: a revoked authorization overrides the happy-path label.
export function OrderStateBadge({ order }: { order: PurchaseOrder }) {
  if ((order.status === "PAYMENT_AUTHORIZED" || order.status === "DISPATCHED") && order.grant.state === "REVOKED_BY_BUYER") {
    return <GrantBadge state="REVOKED_BY_BUYER" />;
  }
  return <OrderStatusBadge status={order.status} />;
}
