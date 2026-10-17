import { ArrowRight, Send } from "lucide-react";
import { Link } from "react-router";
import type { InvestorCatalogEntry } from "@agro/shared/modules/investments/application/use-cases";
import { formatYield } from "@agro/shared/modules/investments/domain/proposal-rules";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Badge } from "@agro/shared/ui/badge";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { proposeBlockText } from "./error-copy";

// A project in the investor's catalog: what it is, how much it needs and either how to propose or why it cannot be.
export function CatalogCard({ entry }: { entry: InvestorCatalogEntry }) {
  const { catalog, block, myLiveProposalId } = entry;
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
            <ProjectStatusBadge status={project.currentStatus} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="line-clamp-3 text-pretty text-sm text-muted-foreground">{project.description}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Hitos</dt>
              <dd className="font-semibold tabular-nums">{catalog.milestones.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total de la cotización</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(catalog.quotationTotal, project.currency)}</dd>
            </div>
            {project.investorRoiPct > 0 && (
              <div>
                <dt className="text-muted-foreground">Rendimiento de referencia</dt>
                <dd className="font-semibold tabular-nums">{formatYield(Math.round(project.investorRoiPct * 100))}</dd>
              </div>
            )}
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            {block === null ? (
              <Button asChild size="compact">
                <Link to={`/investor/projects/${project.id}`}>
                  <Send aria-hidden="true" />
                  Enviar propuesta
                </Link>
              </Button>
            ) : block === "duplicate" && myLiveProposalId ? (
              <Button asChild size="compact">
                <Link to={`/investor/proposals/${myLiveProposalId}`}>Ver mi propuesta</Link>
              </Button>
            ) : (
              <Badge variant="secondary" className="whitespace-normal">
                {proposeBlockText(block)}
              </Badge>
            )}
            <Button asChild variant="outline" size="compact">
              <Link to={`/investor/projects/${project.id}`}>
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
