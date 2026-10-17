import { ArrowRight, Handshake } from "lucide-react";
import { Link } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { CatalogEntry } from "@agro/shared/modules/presales/application/project-negotiation";
import type { StartBlock } from "@agro/shared/modules/presales/domain/negotiation-rules";
import type { Project } from "@agro/shared/modules/projects/domain/project";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Badge } from "@agro/shared/ui/badge";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { ProjectStatusBadge } from "~/components/producer/project-status";

// Why a project (or milestone) cannot be negotiated, in the words shown to the buyer.
export function startBlockText(block: StartBlock, project: Pick<Project, "currentStatus">): string {
  switch (block) {
    case "own_project":
      return "Es un proyecto propio.";
    case "project_status":
      return project.currentStatus === "FUNDED_IN_CUSTODY" ? "Este proyecto ya tiene un pago autorizado." : "Este proyecto ya no admite nuevas negociaciones.";
    case "project_agreed":
      return "Este proyecto ya tiene un acuerdo: no admite nuevas negociaciones.";
    case "milestone_status":
      return "Este hito ya no admite nuevas negociaciones.";
    case "milestone_agreed":
      return "Hito acordado: no admite nuevas negociaciones.";
    case "duplicate":
      return "Ya tienes una negociación activa.";
  }
}

// A project in the buyer's catalog: what it is, its quotation total, and either how to negotiate or why it cannot be.
export function ProjectCard({ entry }: { entry: CatalogEntry }) {
  const { catalog, milestonesCount, total, startBlock, myLiveProjectId } = entry;
  const { project } = catalog;
  return (
    <li className="min-w-0">
      <Card className="h-full">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                {productionTypeLabel(project.productionType)}
                {catalog.producerName ? ` · ${catalog.producerName}` : ""}
              </p>
              <CardTitle className="break-words text-lg text-primary">{project.title}</CardTitle>
            </div>
            <ProjectStatusBadge status={project.currentStatus} audience="buyer" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="line-clamp-3 text-pretty text-sm text-muted-foreground">{project.description}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Hitos</dt>
              <dd className="font-semibold tabular-nums">{milestonesCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total de la cotización del proyecto</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(total, project.currency)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            {startBlock === null ? (
              <Button asChild size="compact">
                <Link to={`/buyer/projects/${project.id}/negotiations/new`}>
                  <Handshake aria-hidden="true" />
                  Iniciar negociación
                </Link>
              </Button>
            ) : startBlock === "duplicate" && myLiveProjectId ? (
              <Button asChild size="compact">
                <Link to={`/buyer/negotiations/${myLiveProjectId}`}>
                  <Handshake aria-hidden="true" />
                  Ver negociación
                </Link>
              </Button>
            ) : (
              <Badge variant="secondary" className="whitespace-normal">
                {startBlockText(startBlock, project)}
              </Badge>
            )}
            <Button asChild variant="outline" size="compact">
              <Link to={`/buyer/projects/${project.id}`}>
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
