import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { RequestEntry } from "@agro/shared/modules/presales/application/use-cases";
import { autoClosedBy } from "@agro/shared/modules/presales/domain/negotiation-rules";
import { Badge } from "@agro/shared/ui/badge";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { LatestOffer } from "~/components/negotiation/latest-offer";
import { entryTitle, scopeKicker } from "~/components/negotiation/scope-label";
import { turnLabel } from "~/components/negotiation/turn-indicator";
import { RequestStatusBadge } from "~/components/presale/status-badges";

// A negotiation in the buyer's inbox (every kind).
export function RequestListItem({ entry }: { entry: RequestEntry }) {
  const { request, unit, turn } = entry;
  const turnText = turnLabel(turn, "BUYER");
  return (
    <li className="min-w-0">
      <Card className="h-full gap-3 py-4">
        <CardHeader className="px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{scopeKicker(entry)}</p>
              <CardTitle className="min-w-0 break-words text-base text-primary">{entryTitle(entry)}</CardTitle>
              {request.producerName && <p className="text-sm text-muted-foreground">{request.producerName}</p>}
            </div>
            <RequestStatusBadge status={request.status} autoClosedBy={autoClosedBy(request)} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          <LatestOffer request={request} unit={unit} />
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="compact">
              <Link to={`/buyer/negotiations/${request.id}`}>
                Ver negociación
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {turnText && <Badge variant={turn === "BUYER" ? "default" : "secondary"}>{turnText}</Badge>}
            {request.deposit?.status === "PENDING" && <Badge variant="secondary">Depósito pendiente</Badge>}
            {request.deposit?.status === "DEPOSITED" && <Badge variant="secondary">Depositado en la fiducia</Badge>}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
