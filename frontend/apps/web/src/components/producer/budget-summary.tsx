import type { MilestoneDetail } from "@agro/shared/modules/milestones/domain/milestone";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Progress } from "@agro/shared/ui/progress";

function BudgetRow({ label, executed, budget, currency }: { label: string; executed: number; budget: number; currency: string }) {
  const percent = budget > 0 ? Math.min(100, Math.round((executed / budget) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatMoney(executed, currency)} de {formatMoney(budget, currency)}
        </span>
      </div>
      <Progress value={percent} aria-label={`${label}: ${percent} % ejecutado`} />
    </div>
  );
}

export function BudgetSummary({ milestone }: { milestone: MilestoneDetail }) {
  return (
    <section aria-labelledby="budget-heading" className="flex flex-col gap-4">
      <h2 id="budget-heading" className="text-lg text-primary">
        Presupuesto ejecutado
      </h2>
      <BudgetRow label="Insumos" executed={milestone.suppliesExecuted} budget={milestone.suppliesBudget} currency={milestone.currency} />
      <BudgetRow label="Mano de obra" executed={milestone.laborExecuted} budget={milestone.laborBudget} currency={milestone.currency} />
    </section>
  );
}
