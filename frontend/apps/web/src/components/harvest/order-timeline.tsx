import type { OrderStatus, PurchaseOrder } from "@agro/shared/modules/harvest/domain/harvest";
import { formatDateTime } from "./format";

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: "AWAITING_PAYMENT_AUTHORIZATION", label: "Orden creada: falta autorizar el pago" },
  { status: "PAYMENT_AUTHORIZED", label: "Pago autorizado" },
  { status: "DISPATCHED", label: "Despachada por el productor" },
  { status: "RECEIVED_CONFIRMED", label: "Recepción confirmada" },
  { status: "SETTLED", label: "Liquidada" },
];

// Linear order timeline: done steps carry their date, the next one is marked as pending. Status = text + symbol.
export function OrderTimeline({ order }: { order: PurchaseOrder }) {
  const reached = new Map(order.events.map((e) => [e.status, e.at]));
  const firstPending = STEPS.findIndex((s) => !reached.has(s.status));
  const cancelled = order.status === "CANCELLED";
  return (
    <ol aria-label="Avance de la orden" className="flex flex-col gap-3">
      {STEPS.map((step, i) => {
        const at = reached.get(step.status);
        const current = !cancelled && i === firstPending;
        return (
          <li key={step.status} className={`flex items-start gap-3 text-sm ${at || current ? "" : "text-muted-foreground"}`} aria-current={current ? "step" : undefined}>
            <span aria-hidden="true" className="mt-0.5 w-4 text-center font-semibold">
              {at ? "✓" : current ? "◷" : "○"}
            </span>
            <span>
              <span className={at || current ? "font-semibold" : ""}>{step.label}</span>
              {at ? <span className="block tabular-nums text-muted-foreground">{formatDateTime(at)}</span> : current ? <span className="block text-muted-foreground">Siguiente paso</span> : null}
            </span>
          </li>
        );
      })}
      {cancelled && (
        <li className="flex items-start gap-3 text-sm font-semibold text-destructive">
          <span aria-hidden="true" className="mt-0.5 w-4 text-center">
            ✕
          </span>
          Orden cancelada
        </li>
      )}
    </ol>
  );
}
