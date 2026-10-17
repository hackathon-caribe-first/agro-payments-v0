import { AUTO_CLOSE_LABELS } from "@agro/shared/modules/presales/domain/negotiation-rules";
import type { Actor, HistoryEntry, NegotiationScope } from "@agro/shared/modules/presales/domain/presale";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatDateTime, formatQuantity, type UnitRef } from "~/components/presale/format";
import { negotiationStatusText } from "./status-badge";

const ACTOR_LABELS: Record<Actor, string> = { BUYER: "Comprador", PRODUCER: "Productor", SYSTEM: "Sistema", UNKNOWN: "Desconocido" };

// Event kinds are free strings on the wire: unknown ones read "Evento" instead of failing.
const KIND_LABELS: Record<string, string> = {
  REQUESTED: "Solicitud",
  OFFER: "Oferta",
  COUNTER_OFFER: "Contraoferta",
  ACCEPT: "Aceptó la oferta",
  REJECT: "Rechazó la oferta",
  WITHDRAW: "Retiró la negociación",
  EXPIRE: "La oferta venció",
  STATUS_CHANGED: "Cambio de estado",
  AUTO_CLOSE: "Negociación cerrada",
  AUTHORIZE_PAYMENT: "Autorizó el pago",
};

function termsLine(entry: HistoryEntry, unit: UnitRef | null, scope: NegotiationScope | null): string | null {
  const p = entry.payload;
  if (entry.kind === "AUTHORIZE_PAYMENT" && p && typeof p.cap === "number") return `Tope ${formatMoney(p.cap, "COP")}`;
  if (entry.kind === "AUTO_CLOSE") return null;
  if (!p) return null;
  if (typeof p.price === "number") return `Precio del hito ${formatMoney(p.price, "COP")}`;
  if (entry.kind === "ACCEPT" && typeof p.agreed_total === "number") return `Total acordado ${formatMoney(p.agreed_total, "COP")}`;
  if (typeof p.quantity !== "number" || typeof p.unit_price !== "number") return null;
  // A PROJECT offer's value is only registered: it is not the authorized total, so the line carries no total.
  if (scope === "PROJECT") return `${formatQuantity(p.quantity, unit)} a ${formatMoney(p.unit_price, "COP")}`;
  const total = typeof p.total === "number" ? p.total : p.quantity * p.unit_price;
  return `${formatQuantity(p.quantity, unit)} a ${formatMoney(p.unit_price, "COP")} · Total ${formatMoney(total, "COP")}`;
}

// Append-only list of rounds, oldest first (the mapper sorts by time).
export function Timeline({ history, unit, scope = null }: { history: HistoryEntry[]; unit: UnitRef | null; scope?: NegotiationScope | null }) {
  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
      <h2 id="timeline-heading" className="text-lg text-primary">
        Historial
      </h2>
      {history.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay movimientos.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {history.map((h) => {
            const terms = termsLine(h, unit, scope);
            const label =
              h.kind === "STATUS_CHANGED" && h.from && h.to
                ? `${negotiationStatusText(h.from)} → ${negotiationStatusText(h.to)}`
                : h.kind === "AUTO_CLOSE"
                  ? AUTO_CLOSE_LABELS[h.payload?.reason === "MILESTONE" ? "MILESTONE" : "PROJECT"]
                  : (KIND_LABELS[h.kind] ?? "Evento");
            return (
              <li key={h.id} className="rounded-md border bg-card p-3">
                <p className="font-semibold">{label}</p>
                <p className="text-sm text-muted-foreground">
                  {ACTOR_LABELS[h.actor]} · {formatDateTime(h.at)}
                </p>
                {terms && <p className="mt-1 text-sm tabular-nums">{terms}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
