import type { CatalogMilestone } from "@agro/shared/modules/investments/domain/investment";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatDay } from "~/components/presale/format";

// Read-only milestones of a project with their caps (topes): the investor sees what each grant would be limited to.
export function ProjectMilestones({ milestones, currency }: { milestones: CatalogMilestone[]; currency: string }) {
  if (milestones.length === 0) {
    return <p className="rounded-lg border bg-card p-5 text-muted-foreground">Este proyecto aún no tiene hitos.</p>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {milestones.map((m) => (
        <li key={m.id} className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Hito {m.sequenceOrder}</p>
              <h3 className="break-words text-base font-semibold text-primary">{m.title}</h3>
            </div>
            <p className="text-sm tabular-nums text-muted-foreground">
              Tope <span className="font-semibold text-foreground">{formatMoney(m.budget, currency)}</span>
            </p>
          </div>
          {m.description && <p className="mt-2 text-pretty text-sm text-muted-foreground">{m.description}</p>}
          <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Insumos y servicios</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(m.suppliesBudget, currency)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Mano de obra</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(m.laborBudget, currency)}</dd>
            </div>
            {m.dueDate && (
              <div>
                <dt className="text-muted-foreground">Plazo</dt>
                <dd className="font-semibold">{formatDay(m.dueDate)}</dd>
              </div>
            )}
          </dl>
        </li>
      ))}
    </ol>
  );
}
