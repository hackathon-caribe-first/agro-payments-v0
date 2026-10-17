import { ArrowRight } from "lucide-react";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Link } from "react-router";
import { formatKg, type PurchaseOrder } from "@agro/shared/modules/harvest-batches/domain/harvest";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDate } from "./format";
import { OrderStateBadge } from "./status";

// An order in a list; `to` is the area-specific detail URL, `counterpart` the other party.
export function OrderCard({ order, to, counterpart }: { order: PurchaseOrder; to: string; counterpart: string }) {
  return (
    <li className="min-w-0">
      <Card className="h-full">
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            {productionTypeLabel(order.productionType)} · {counterpart}
          </p>
          <CardTitle className="break-words text-lg text-primary">{order.projectTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <OrderStateBadge order={order} />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Cantidad</dt>
              <dd className="font-semibold tabular-nums">{formatKg(order.quantityKg)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total de la orden</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(order.total, order.currency)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">Creada el</dt>
              <dd className="tabular-nums">{formatDate(order.createdAt)}</dd>
            </div>
          </dl>
          <Button asChild variant="outline" size="compact" className="self-start">
            <Link to={to}>
              Ver orden
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}
