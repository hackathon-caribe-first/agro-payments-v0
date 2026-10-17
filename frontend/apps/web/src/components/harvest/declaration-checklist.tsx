import { Link } from "react-router";
import type { DeclarationBlocker } from "@agro/shared/modules/harvest-batches/domain/rules";
import type { MilestoneProgress } from "@agro/shared/modules/harvest-batches/domain/harvest";

const MILESTONE_STATUS_TEXT: Record<string, string> = {
  LOCKED: "Bloqueado",
  ACTIVE: "Activo",
  SUPPLIES_ORDERED: "Insumos pedidos",
  SUPPLIES_PAID: "Insumos pagados",
  IN_FIELD_EXECUTION: "En ejecución",
  SUBMITTED_FOR_REVIEW: "En revisión",
  CHANGES_REQUESTED: "Observado",
  TECHNICALLY_APPROVED: "Aprobado, pago pendiente",
  LABOR_PAYOUT_PENDING: "Pago de mano de obra pendiente",
  COMPLETED_AND_PAID: "Completado y pagado",
};

// Why the harvest cannot be declared yet: one row per milestone, done or pending.
export function DeclarationChecklist({ milestones, blockers }: { milestones: MilestoneProgress[]; blockers: DeclarationBlocker[] }) {
  const statusBlock = blockers.find((b) => b.kind === "project_status");
  return (
    <section aria-labelledby="declaration-blockers" className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <h2 id="declaration-blockers" className="text-lg text-primary">
        Todavía no puedes declarar la cosecha
      </h2>
      <p className="text-sm text-muted-foreground">Primero deben estar completados y pagados todos los hitos del proyecto.</p>
      {statusBlock && <p className="text-sm font-semibold text-destructive">✕ El proyecto no está en ejecución, así que no admite una declaración de cosecha.</p>}
      <ul className="flex flex-col gap-2">
        {[...milestones]
          .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
          .map((m) => {
            const done = m.status === "COMPLETED_AND_PAID";
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className={done ? "text-muted-foreground" : "font-semibold"}>
                  <span aria-hidden="true">{done ? "✓ " : "◷ "}</span>
                  {m.sequenceOrder}. {m.title}
                </span>
                <span className="flex items-center gap-3">
                  <span className={done ? "text-primary" : "text-muted-foreground"}>{MILESTONE_STATUS_TEXT[m.status] ?? "Estado desconocido"}</span>
                  {!done && (
                    <Link to={`/producer/milestones/${m.id}`} className="font-bold text-primary underline underline-offset-4">
                      Ver hito
                    </Link>
                  )}
                </span>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
