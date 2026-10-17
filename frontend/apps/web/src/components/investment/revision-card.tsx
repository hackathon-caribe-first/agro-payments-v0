import type { ProposalRevision } from "@agro/shared/modules/investments/domain/investment";
import { formatYield, yieldAmount } from "@agro/shared/modules/investments/domain/proposal-rules";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDay, formatDateTime } from "~/components/presale/format";
import { RevisionStatusBadge } from "./status-badges";

const AUTHOR_TITLES: Record<ProposalRevision["author"], string> = {
  INVESTOR: "Propuesta del inversor",
  PRODUCER: "Contraoferta del productor",
  SYSTEM: "Sistema",
  UNKNOWN: "Oferta",
};

// One round of the proposal: the money terms of that revision and what became of it.
export function RevisionCard({ revision }: { revision: ProposalRevision }) {
  const estimated = yieldAmount(revision.amount, revision.yieldBps);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Ronda {revision.revision}</p>
            <CardTitle className="text-base text-primary">{AUTHOR_TITLES[revision.author]}</CardTitle>
          </div>
          <RevisionStatusBadge status={revision.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Monto</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(revision.amount, revision.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Rendimiento</dt>
            <dd className="font-semibold tabular-nums">{formatYield(revision.yieldBps)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Rendimiento estimado</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(estimated, revision.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vigente hasta</dt>
            <dd className="font-semibold">{formatDay(revision.validUntil)}</dd>
          </div>
        </dl>
        {revision.notes && <p className="text-pretty text-sm text-muted-foreground">{revision.notes}</p>}
        <p className="text-xs text-muted-foreground">Enviada el {formatDateTime(revision.createdAt)}</p>
      </CardContent>
    </Card>
  );
}
