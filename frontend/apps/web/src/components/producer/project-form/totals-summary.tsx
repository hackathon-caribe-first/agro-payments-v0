import { milestoneQuotation, projectTargetAmount } from "@agro/shared/modules/projects/domain/project-draft";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Card, CardContent } from "@agro/shared/ui/card";

export interface QuotedMilestone {
  key: string;
  title: string;
  suppliesBudget: number;
  laborBudget: number;
}

export function TotalsSummary({ milestones }: { milestones: QuotedMilestone[] }) {
  const total = projectTargetAmount(milestones);
  return (
    <Card className="gap-3 py-4" aria-label="Resumen de cotización">
      <CardContent className="flex flex-col gap-2 px-4">
        <ul className="flex flex-col gap-1 text-sm">
          {milestones.map((m, i) => (
            <li key={m.key} className="flex items-baseline justify-between gap-3">
              <span className="truncate text-muted-foreground">
                Hito {i + 1}
                {m.title.trim() ? ` · ${m.title.trim()}` : ""}
              </span>
              <span className="text-right tabular-nums">{formatMoney(milestoneQuotation(m), "COP")}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between gap-3 border-t pt-2">
          <span className="font-semibold">Total del proyecto</span>
          <span className="text-right text-lg font-semibold tabular-nums text-primary">{formatMoney(total, "COP")}</span>
        </div>
      </CardContent>
    </Card>
  );
}
