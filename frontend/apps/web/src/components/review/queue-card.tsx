import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { QueueItem, QueueTab } from "@agro/shared/modules/reviews/domain/review";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { MilestoneStatusBadge } from "~/components/producer/status-label";
import { formatDateTime } from "./format";

const REFERENCE_LABEL: Record<QueueTab, string> = {
  pending: "Enviado el",
  changes: "Observado el",
  decided: "Decidido el",
};

// A milestone in the verifier's queue.
export function QueueCard({ item, tab }: { item: QueueItem; tab: QueueTab }) {
  const cta = tab === "pending" ? "Revisar y dictaminar" : "Ver verificación";
  return (
    <li className="min-w-0">
      <Card className="h-full gap-3 py-4">
        <CardHeader className="px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words text-sm text-muted-foreground">{item.projectTitle}</p>
              <CardTitle className="min-w-0 break-words text-base text-primary">
                Hito {item.sequenceOrder} · {item.title}
              </CardTitle>
            </div>
            <MilestoneStatusBadge status={item.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Insumos</dt>
            <dd className="text-right tabular-nums">{formatMoney(item.suppliesBudget, item.currency)}</dd>
            <dt className="text-muted-foreground">Mano de obra</dt>
            <dd className="text-right tabular-nums">{formatMoney(item.laborBudget, item.currency)}</dd>
            <dt className="text-muted-foreground">Registros de campo</dt>
            <dd className="text-right tabular-nums">{item.logCount}</dd>
            {item.referenceAt && (
              <>
                <dt className="text-muted-foreground">{REFERENCE_LABEL[tab]}</dt>
                <dd className="text-right">{formatDateTime(item.referenceAt)}</dd>
              </>
            )}
          </dl>
          {tab === "changes" && item.lastComment && <p className="line-clamp-3 text-sm text-muted-foreground">“{item.lastComment}”</p>}
          <Button asChild variant={tab === "pending" ? "default" : "outline"} size="compact" className="self-start">
            <Link to={`/verifier/reviews/${item.milestoneId}`}>
              {cta}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}
