import { ArrowRight, FileSignature } from "lucide-react";
import { Link } from "react-router";
import type { ProposalEntry } from "@agro/shared/modules/investment-proposals/application/use-cases";
import type { Party } from "@agro/shared/modules/investment-proposals/domain/investment";
import { formatYield, latestRevision } from "@agro/shared/modules/investment-proposals/domain/proposal-rules";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Badge } from "@agro/shared/ui/badge";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { ProposalStatusBadge } from "./status-badges";
import { turnLabel } from "./turn-indicator";

// A proposal in the investor's or the producer's list. Links to the detail and, once agreed, to the contract.
export function ProposalListItem({ entry, viewer }: { entry: ProposalEntry; viewer: Party }) {
  const { proposal, turn } = entry;
  const area = viewer === "INVESTOR" ? "investor" : "producer";
  const latest = latestRevision(proposal);
  const turnText = turnLabel(turn, viewer);
  const counterpart = viewer === "INVESTOR" ? proposal.producerName : proposal.investorName;
  return (
    <li className="min-w-0">
      <Card className="h-full gap-3 py-4">
        <CardHeader className="px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{counterpart}</p>
              <CardTitle className="min-w-0 break-words text-base text-primary">{proposal.projectTitle}</CardTitle>
            </div>
            <ProposalStatusBadge status={proposal.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          {latest && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Monto</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(latest.amount, latest.currency)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rendimiento</dt>
                <dd className="font-semibold tabular-nums">{formatYield(latest.yieldBps)}</dd>
              </div>
            </dl>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="compact">
              <Link to={`/${area}/proposals/${proposal.id}`}>
                Ver propuesta
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {proposal.contractId && (
              <Button asChild variant="outline" size="compact">
                <Link to={`/${area}/contracts/${proposal.contractId}`}>
                  <FileSignature aria-hidden="true" />
                  Ver contrato
                </Link>
              </Button>
            )}
            {turnText && <Badge variant={turn === viewer ? "default" : "secondary"}>{turnText}</Badge>}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
