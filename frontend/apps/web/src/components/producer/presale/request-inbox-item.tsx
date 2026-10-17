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

// A negotiation in the producer's inbox (every kind).
export function RequestInboxItem({ entry }: { entry: RequestEntry }) {
  const { request, unit, turn } = entry;
  const turnText = turnLabel(turn, "PRODUCER");
  return (
    <li className="min-w-0">
      <Card className="h-full gap-3 py-4">
        <CardHeader className="px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                {scopeKicker(entry)} · {entryTitle(entry)}
              </p>
              <CardTitle className="break-words text-base text-primary">{request.buyerName}</CardTitle>
            </div>
            <RequestStatusBadge status={request.status} autoClosedBy={autoClosedBy(request)} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          <LatestOffer request={request} unit={unit} />
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="compact">
              <Link to={`/producer/negotiations/${request.id}`}>
                Ver negociación
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {turnText && <Badge variant={turn === "PRODUCER" ? "default" : "secondary"}>{turnText}</Badge>}
            {request.authorization?.status === "PENDING" && <Badge variant="secondary">Autorización pendiente</Badge>}
            {request.authorization?.status === "AUTHORIZED" && <Badge variant="secondary">Pago autorizado</Badge>}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
