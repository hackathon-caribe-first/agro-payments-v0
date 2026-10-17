import type { Actor, HistoryEntry } from "@agro/shared/modules/presales/domain/presale";
import { formatDateTime } from "./format";
import { requestStatusText } from "./status-badges";

const ACTOR_LABELS: Record<Actor, string> = { BUYER: "Comprador", PRODUCER: "Productor", SYSTEM: "Sistema", UNKNOWN: "Desconocido" };

// Event types are free strings, so unknown ones render generically instead of failing.
const EVENT_LABELS: Record<string, string> = { REQUESTED: "Solicitud enviada", STATUS_CHANGED: "Cambio de estado" };

function describe(h: HistoryEntry): string {
  if (h.type === "STATUS_CHANGED" && h.from && h.to) return `${requestStatusText(h.from)} → ${requestStatusText(h.to)}`;
  return EVENT_LABELS[h.type] ?? "Movimiento";
}

// Entries arrive ordered by time (the mapper sorts them).
export function RequestHistory({ history }: { history: HistoryEntry[] }) {
  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-3">
      <h2 id="history-heading" className="text-lg text-primary">
        Historial
      </h2>
      {history.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay movimientos.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {history.map((h) => (
            <li key={h.id} className="rounded-md border bg-card p-3">
              <p className="font-semibold">{describe(h)}</p>
              <p className="text-sm text-muted-foreground">
                {ACTOR_LABELS[h.actor]} · {formatDateTime(h.at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
