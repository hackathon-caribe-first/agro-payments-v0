import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { RequestEntry } from "@agro/shared/modules/presales/application/use-cases";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { availableQuantity } from "@agro/shared/modules/presales/domain/presale-rules";
import { formatDay, formatQuantity } from "~/components/presale/format";
import { RequestStatusBadge } from "~/components/presale/status-badges";

export function RequestInboxItem({ entry }: { entry: RequestEntry }) {
  const { request, listing } = entry;
  return (
    <li className="min-w-0">
      <Card className="h-full gap-3 py-4">
        <CardHeader className="px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{listing?.title ?? "Preventa"}</p>
              <CardTitle className="break-words text-base text-primary">{request.buyerName}</CardTitle>
            </div>
            <RequestStatusBadge status={request.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Cantidad solicitada</dt>
              <dd className="font-semibold tabular-nums">{formatQuantity(request.quantity, listing)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Entrega deseada</dt>
              <dd className="font-semibold">{formatDay(request.desiredDeliveryDate)}</dd>
            </div>
          </dl>
          {listing && (
            <p className="text-sm tabular-nums text-muted-foreground">
              {availableQuantity(listing) > 0
                ? `Disponible ${formatQuantity(availableQuantity(listing), listing)} de ${formatQuantity(listing.expectedQuantity, listing)}`
                : "Sin disponibilidad"}
            </p>
          )}
          <Button asChild variant="outline" size="compact" className="self-start">
            <Link to={`/productor/solicitudes/${request.id}`}>
              Ver solicitud
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}
