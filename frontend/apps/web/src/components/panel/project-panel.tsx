import { FileSearch } from "lucide-react";
import { Link } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { PanelMilestone, PanelProject } from "@agro/shared/modules/panel/domain/panel";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Progress } from "@agro/shared/ui/progress";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import { GrantStatusBadge } from "~/components/grant/status";

function MilestoneRow({ milestone, currency }: { milestone: PanelMilestone; currency: string }) {
  const { grant, lines } = milestone;
  return (
    <li className="flex flex-col gap-2 border-t py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Hito {milestone.sequenceOrder}</p>
          <p className="break-words font-semibold">{milestone.title}</p>
        </div>
        {grant ? <GrantStatusBadge status={grant.status} /> : <StatusBadge label="Sin grant" tone="neutral" symbol="○" />}
      </div>

      {grant ? (
        <>
          <Progress value={milestone.progressPct} aria-label={`Gastado del tope del hito ${milestone.sequenceOrder}`} aria-valuenow={milestone.progressPct} />
          <p className="flex flex-wrap justify-between gap-x-3 text-sm text-muted-foreground">
            <span>
              Gastado <span className="font-semibold tabular-nums text-foreground">{formatMoney(grant.spent, currency)}</span> de{" "}
              <span className="tabular-nums">{formatMoney(grant.cap, currency)}</span> ({milestone.progressPct} %)
            </span>
            {grant.remainingInWallet !== null && (
              <span>
                Sigue en tu billetera <span className="font-semibold tabular-nums text-foreground">{formatMoney(grant.remainingInWallet, currency)}</span>
              </span>
            )}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Tope del hito: {formatMoney(milestone.cap, currency)}. Todavía no hay un grant para este hito.</p>
      )}

      {lines.total > 0 && (
        <p className="text-sm text-muted-foreground">
          {lines.paid} de {lines.total} {lines.total === 1 ? "línea pagada" : "líneas pagadas"}
          {lines.pending > 0 && ` · ${lines.pending} por pagar`}
          {lines.failed > 0 && ` · ${lines.failed} con pago fallido`}
        </p>
      )}
      {grant && (
        <Link to={`/investor/grants/${grant.id}`} className="self-start text-sm font-bold text-primary underline underline-offset-4">
          Ver grant y comprobantes
        </Link>
      )}
    </li>
  );
}

// One funded project: totals, milestone-by-milestone grant progress, settlement state and the way to its audit trail.
export function ProjectPanel({ project }: { project: PanelProject }) {
  return (
    <li className="min-w-0">
      <Card className="h-full">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="break-words text-lg text-primary">{project.title}</CardTitle>
              {project.contractId && (
                <p className="mt-1 text-sm">
                  <Link to={`/investor/contracts/${project.contractId}`} className="font-bold text-primary underline underline-offset-4">
                    Ver contrato
                  </Link>
                </p>
              )}
            </div>
            <Button asChild variant="outline" size="compact">
              <Link to={`/investor/projects/${project.id}/audit`}>
                <FileSearch aria-hidden="true" />
                Auditoría del proyecto
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Progress value={project.progressPct} aria-label={`Gastado del proyecto ${project.title}`} aria-valuenow={project.progressPct} />
            <p className="flex flex-wrap justify-between gap-x-3 text-sm text-muted-foreground">
              <span>
                Gastado <span className="font-semibold tabular-nums text-foreground">{formatMoney(project.spent, project.currency)}</span> de{" "}
                <span className="tabular-nums">{formatMoney(project.cap, project.currency)}</span> autorizados
              </span>
              <span>
                Sigue en tu billetera <span className="font-semibold tabular-nums text-foreground">{formatMoney(project.remainingInWallet, project.currency)}</span>
              </span>
            </p>
          </div>

          <ul className="flex flex-col">
            {project.milestones.map((m) => (
              <MilestoneRow key={m.id} milestone={m} currency={project.currency} />
            ))}
          </ul>

          {project.settlements.length > 0 && (
            <div className="flex flex-col gap-1 border-t pt-3 text-sm">
              <p className="font-semibold">Liquidación de la cosecha</p>
              {project.settlements.map((s) => (
                <p key={s.id} className="text-muted-foreground">
                  {s.paidLines} de {s.lines} pagos completados por {formatMoney(s.total, project.currency)}.{" "}
                  <Link to={`/investor/settlements/${project.id}`} className="font-bold text-primary underline underline-offset-4">
                    Ver liquidación
                  </Link>
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
