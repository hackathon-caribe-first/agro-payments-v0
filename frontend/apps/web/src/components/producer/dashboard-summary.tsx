import type { DashboardSummary as Summary } from "@agro/shared/modules/projects/domain/project-rules";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Progress } from "@agro/shared/ui/progress";

function Stat({ title, value, detail, percent }: { title: string; value: string; detail?: string; percent?: number }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <CardTitle className="text-2xl tabular-nums text-primary">{value}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 px-4">
        {percent !== undefined && <Progress value={percent} aria-label={`${title}: ${percent} %`} />}
        {detail && <p className="text-sm tabular-nums text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardSummary({ summary, currency }: { summary: Summary; currency: string }) {
  return (
    <section aria-label="Resumen" className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
      <Stat title="Proyectos activos" value={String(summary.activeCount)} />
      <Stat title="Proyectos terminados" value={String(summary.finishedCount)} />
      <Stat title="Cotización total" value={formatMoney(summary.totalQuotation, currency)} detail="Suma de los proyectos activos" />
      <Stat
        title="Avance de hitos"
        value={`${summary.milestonePercent} %`}
        percent={summary.milestonePercent}
        detail={`${summary.milestonesCompleted} de ${summary.milestonesTotal} hitos completados`}
      />
    </section>
  );
}
