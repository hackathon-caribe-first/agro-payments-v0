import { Handshake } from "lucide-react";
import { Link } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { MilestoneRow } from "@agro/shared/modules/presales/application/project-negotiation";
import type { Project } from "@agro/shared/modules/projects/domain/project";
import { Button } from "@agro/shared/ui/button";
import { formatDay } from "~/components/presale/format";
import { startBlockText } from "./project-card";

// One milestone of a project: its reference budget and date, the price this buyer agreed (if any), and how to negotiate it.
export function MilestoneNegotiationRow({ row, project }: { row: MilestoneRow; project: Project }) {
  const { summary, reference, agreedPrice, estimatedCompletionDate, startBlock, myLiveId } = row;
  const reasonId = `milestone-${summary.id}-reason`;
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Hito {summary.sequenceOrder}</p>
          <h3 className="min-w-0 break-words text-base text-primary">{summary.title}</h3>
        </div>
        {startBlock === null ? (
          <Button asChild size="compact">
            <Link to={`/buyer/projects/${project.id}/negotiations/new?milestone=${summary.id}`}>
              <Handshake aria-hidden="true" />
              Iniciar negociación
            </Link>
          </Button>
        ) : startBlock === "duplicate" && myLiveId ? (
          <Button asChild variant="outline" size="compact">
            <Link to={`/buyer/negotiations/${myLiveId}`}>Ver negociación</Link>
          </Button>
        ) : (
          <Button type="button" size="compact" disabled aria-describedby={reasonId}>
            <Handshake aria-hidden="true" />
            Iniciar negociación
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Presupuesto de referencia</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(reference, summary.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fecha estimada</dt>
          <dd className="font-semibold">{estimatedCompletionDate ? formatDay(estimatedCompletionDate) : "Sin definir"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Precio acordado</dt>
          <dd className="font-semibold tabular-nums">{agreedPrice !== null ? formatMoney(agreedPrice, summary.currency) : "Sin acuerdo"}</dd>
        </div>
      </dl>
      {startBlock !== null && !(startBlock === "duplicate" && myLiveId) && (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {startBlockText(startBlock, project)}
        </p>
      )}
    </li>
  );
}
