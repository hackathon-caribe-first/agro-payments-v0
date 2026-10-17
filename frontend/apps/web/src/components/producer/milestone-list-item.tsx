import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import type { MilestoneSummary } from "@agro/shared/modules/milestones/domain/milestone";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import type { PendingRetry } from "@agro/shared/modules/payment-lines/domain/line";
import { PendingRetryBanner } from "~/components/split/pending-retry-banner";
import { IS_HTTP } from "~/platform/transport";
import { MilestoneStatusBadge } from "./status-label";

export function MilestoneListItem({ milestone, pending }: { milestone: MilestoneSummary; pending?: PendingRetry }) {
  const locked = milestone.status === "LOCKED";
  return (
    <li>
      <Card className="h-full">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Hito {milestone.sequenceOrder}</p>
              <CardTitle className="min-w-0 break-words text-lg text-primary">{milestone.title}</CardTitle>
            </div>
            <MilestoneStatusBadge status={milestone.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Presupuesto de insumos</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(milestone.suppliesBudget, milestone.currency)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Presupuesto de mano de obra</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(milestone.laborBudget, milestone.currency)}</dd>
            </div>
          </dl>
          {pending && <PendingRetryBanner pending={pending} linesHref={IS_HTTP ? undefined : `/producer/milestones/${milestone.id}/lines`} />}
          {locked ? (
            <p className="text-sm text-muted-foreground">Este hito se habilita cuando se completa el anterior.</p>
          ) : (
            <Button asChild variant="outline" size="compact" className="self-start">
              <Link to={`/producer/milestones/${milestone.id}`}>
                Ver detalle
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
