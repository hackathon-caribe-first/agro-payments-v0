import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { OpenRequestEntry } from "@agro/shared/modules/presales/application/use-cases";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDay, formatQuantity, unitText } from "~/components/presale/format";
import { AllocationMeter } from "./allocation-meter";
import { OpenRequestViewBadge } from "./view-badge";

interface Props {
  entry: OpenRequestEntry;
  to: string;
  actionLabel: string;
  // The producer catalog shows who is asking; the buyer's own list does not need to.
  showBuyer?: boolean;
}

export function OpenRequestCard({ entry, to, actionLabel, showBuyer = false }: Props) {
  const { openRequest, view, remaining } = entry;
  return (
    <li className="min-w-0">
      <Card className="h-full gap-3 py-4">
        <CardHeader className="px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                {openRequest.productionType}
                {showBuyer ? ` · ${openRequest.buyerName}` : ""}
              </p>
              <CardTitle className="break-words text-base text-primary">{openRequest.title}</CardTitle>
            </div>
            <OpenRequestViewBadge view={view} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Cantidad</dt>
              <dd className="font-semibold tabular-nums">{formatQuantity(openRequest.quantity, openRequest)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pendiente</dt>
              <dd className="font-semibold tabular-nums">{formatQuantity(remaining, openRequest)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Precio objetivo</dt>
              <dd className="font-semibold tabular-nums">
                {openRequest.targetUnitPrice === null
                  ? "Sin definir"
                  : `${formatMoney(openRequest.targetUnitPrice, openRequest.currency)} / ${unitText(openRequest, 1)}`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Necesaria para</dt>
              <dd className="font-semibold">{formatDay(openRequest.deliveryDate)}</dd>
            </div>
          </dl>
          <AllocationMeter openRequest={openRequest} remaining={remaining} />
          <Button asChild variant="outline" size="compact" className="self-start">
            <Link to={to}>
              {actionLabel}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}
