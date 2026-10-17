import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { RequestEntry } from "@agro/shared/modules/presales/application/use-cases";
import { Badge } from "@agro/shared/ui/badge";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { availableQuantity } from "@agro/shared/modules/presales/domain/presale-rules";
import { LatestOffer } from "~/components/negotiation/latest-offer";
import { originLabel } from "~/components/negotiation/origin";
import { turnLabel } from "~/components/negotiation/turn-indicator";
import { formatQuantity } from "~/components/presale/format";
import { RequestStatusBadge } from "~/components/presale/status-badges";

// A negotiation in the producer's inbox (both origins).
export function RequestInboxItem({ entry }: { entry: RequestEntry }) {
  const { request, listing, turn } = entry;
  const turnText = turnLabel(turn, "PRODUCER");
  return (
    <li className="min-w-0">
      <Card className="h-full gap-3 py-4">
        <CardHeader className="px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                {originLabel(request.origin)} · {listing?.title ?? "Proyecto"}
              </p>
              <CardTitle className="break-words text-base text-primary">{request.buyerName}</CardTitle>
            </div>
            <RequestStatusBadge status={request.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          <LatestOffer request={request} unit={listing} />
          {listing && (
            <p className="text-sm tabular-nums text-muted-foreground">
              {availableQuantity(listing) > 0
                ? `Disponible ${formatQuantity(availableQuantity(listing), listing)} de ${formatQuantity(listing.expectedQuantity, listing)}`
                : "Sin disponibilidad"}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="compact">
              <Link to={`/producer/negotiations/${request.id}`}>
                Ver negociación
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {turnText && <Badge variant={turn === "PRODUCER" ? "default" : "secondary"}>{turnText}</Badge>}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
