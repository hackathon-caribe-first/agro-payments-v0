import type { Actor, HistoryEntry } from "@agro/shared/modules/investments/domain/investment";
import { formatYield } from "@agro/shared/modules/investments/domain/proposal-rules";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatDateTime } from "~/components/presale/format";
import { proposalStatusText } from "./status-badges";

const ACTOR_LABELS: Record<Actor, string> = { INVESTOR: "Inversor", PRODUCER: "Productor", SYSTEM: "Sistema", UNKNOWN: "Desconocido" };

// Event kinds are free strings on the wire: unknown ones read "Evento" instead of failing.
const KIND_LABELS: Record<string, string> = {
  PROPOSED: "Propuesta de inversión",
  COUNTER_OFFER: "Contraoferta",
  ACCEPT: "Aceptó la oferta",
  REJECT: "Rechazó la oferta",
  WITHDRAW: "Retiró la propuesta",
  EXPIRE: "La propuesta venció",
  AUTO_CLOSE: "Propuesta cerrada: el proyecto ya tiene un acuerdo",
  CONTRACT_GENERATED: "Contrato generado",
  CONTRACT_SIGNED: "Firmó el contrato",
};

function termsLine(entry: HistoryEntry): string | null {
  const p = entry.payload;
  if (!p || typeof p.amount !== "number" || typeof p.yield_bps !== "number") return null;
  return `${formatMoney(p.amount, "COP")} · ${formatYield(p.yield_bps)}`;
}

// Append-only list of rounds, oldest first (the mapper sorts by time).
export function Timeline({ history }: { history: HistoryEntry[] }) {
  return (
    <section aria-labelledby="proposal-timeline-heading" className="flex flex-col gap-3">
      <h2 id="proposal-timeline-heading" className="text-lg text-primary">
        Historial
      </h2>
      {history.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay movimientos.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {history.map((h) => {
            const terms = termsLine(h);
            const label =
              h.kind === "UNKNOWN" && h.from && h.to ? `${proposalStatusText(h.from)} → ${proposalStatusText(h.to)}` : (KIND_LABELS[h.kind] ?? "Evento");
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
