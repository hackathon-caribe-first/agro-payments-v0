import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { RequestEntry } from "@agro/shared/modules/presales/application/use-cases";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDay, formatQuantity } from "~/components/presale/format";
import { RequestStatusBadge } from "~/components/presale/status-badges";

export function RequestListItem({ entry }: { entry: RequestEntry }) {
  const { request, listing } = entry;
  return (
    <li className="min-w-0">
      <Card className="h-full gap-3 py-4">
        <CardHeader className="px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="min-w-0 break-words text-base text-primary">{listing?.title ?? "Preventa"}</CardTitle>
            <RequestStatusBadge status={request.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Cantidad</dt>
              <dd className="font-semibold tabular-nums">{formatQuantity(request.quantity, listing)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Entrega deseada</dt>
              <dd className="font-semibold">{formatDay(request.desiredDeliveryDate)}</dd>
            </div>
          </dl>
          <Button asChild variant="outline" size="compact" className="self-start">
            <Link to={`/comprador/solicitudes/${request.id}`}>
              Ver solicitud
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}
