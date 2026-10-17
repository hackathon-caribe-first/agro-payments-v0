import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import type { ProjectOverview } from "@agro/shared/modules/projects/application/use-cases";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Progress } from "@agro/shared/ui/progress";
import { ProjectStatusBadge } from "./project-status";

const dateFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });

export function ProjectCard({ overview }: { overview: ProjectOverview }) {
  const { project, progress, quotation } = overview;
  return (
    <li>
      <Card className="h-full">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                {project.projectCode} · {productionTypeLabel(project.productionType)}
              </p>
              <CardTitle className="text-lg text-primary">{project.title}</CardTitle>
            </div>
            <ProjectStatusBadge status={project.currentStatus} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">Cotización</span>
              <span className="tabular-nums">{formatMoney(project.targetAmount, project.currency)}</span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted-foreground">
              <span>Ejecutado de la cotización</span>
              <span className="tabular-nums">
                {formatMoney(quotation.executed, project.currency)} de {formatMoney(quotation.quoted, project.currency)}
              </span>
            </div>
            <Progress value={quotation.percent} aria-label={`Ejecutado de la cotización: ${quotation.percent} %`} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">Avance de hitos</span>
              <span className="tabular-nums text-muted-foreground">
                {progress.completed} de {progress.total} hitos · {progress.percent} %
              </span>
            </div>
            <Progress value={progress.percent} aria-label={`Avance de hitos: ${progress.percent} %`} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Fin estimado: {dateFormat.format(new Date(project.estimatedEndDate))}
            </p>
            <Button asChild variant="outline" size="compact">
              <Link to={`/producer/projects/${project.id}`}>
                Ver proyecto
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
