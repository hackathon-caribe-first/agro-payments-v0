import { formatKg, type PurchaseOrder } from "@agro/shared/modules/harvest-batches/domain/harvest";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatBp, formatDate } from "./format";
import { GrantBadge, OrderStateBadge } from "./status";

// Aside of an order: what is being bought, for how much and the state of the buyer's authorization.
export function OrderSummary({ order }: { order: PurchaseOrder }) {
  return (
    <section aria-label="Resumen de la orden" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div>
        <p className="text-sm text-muted-foreground">{productionTypeLabel(order.productionType)}</p>
        <h2 className="break-words text-lg text-primary">{order.projectTitle}</h2>
      </div>
      <OrderStateBadge order={order} />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Cantidad</dt>
          <dd className="font-semibold tabular-nums">{formatKg(order.quantityKg)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Precio por kilo</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(order.unitPrice, order.currency)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Total de la orden</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatMoney(order.total, order.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Comprador</dt>
          <dd>{order.buyerName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Productor</dt>
          <dd>{order.producerName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Comisión de la Plataforma</dt>
          <dd className="tabular-nums">{formatBp(order.platformFeeBp)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Creada el</dt>
          <dd className="tabular-nums">{formatDate(order.createdAt)}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-1.5 border-t pt-3">
        <p className="text-sm text-muted-foreground">Autorización de pago del comprador</p>
        <GrantBadge state={order.grant.state} />
        {order.grant.state === "LIVE" && (
          <p className="text-sm text-muted-foreground">Tope {formatMoney(order.grant.cap, order.currency)}. El dinero sigue en la billetera del comprador hasta confirmar la recepción.</p>
        )}
        {order.grant.revocationProof && <p className="text-sm text-muted-foreground">{order.grant.revocationProof}</p>}
      </div>
      {order.dispatch && (
        <div className="border-t pt-3 text-sm">
          <p className="text-muted-foreground">Despacho</p>
          <p className="font-semibold">
            {order.dispatch.carrier} · guía <span className="tabular-nums">{order.dispatch.trackingNumber}</span>
          </p>
          <a href={order.dispatch.photoUrl} target="_blank" rel="noreferrer" className="font-bold text-primary underline underline-offset-4">
            Ver foto del despacho
          </a>
        </div>
      )}
    </section>
  );
}
