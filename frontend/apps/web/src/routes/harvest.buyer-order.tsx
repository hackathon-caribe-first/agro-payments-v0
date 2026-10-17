import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { BuyerOrderActions } from "~/components/harvest/buyer-order-actions";
import { linkClass, orderCode } from "~/components/harvest/format";
import { OrderSummary } from "~/components/harvest/order-summary";
import { OrderTimeline } from "~/components/harvest/order-timeline";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { SettlementTable } from "~/components/harvest/settlement-table";
import { answer, unwrap, type HarvestActionData } from "~/harvest-batches/action-data";
import { buyerHarvest } from "~/harvest-batches/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/harvest.buyer-order";

export const meta = () => [{ title: "Orden · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return unwrap(await buyerHarvest.getOrderDetail(params.orderId));
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<HarvestActionData> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const intent = String((await request.formData()).get("intent") ?? "");
  if (intent === "confirm-reception") return answer(await buyerHarvest.confirmReception(params.orderId), intent);
  if (intent === "revoke") return answer(await buyerHarvest.revokeAuthorization(params.orderId), intent);
  if (intent === "cancel") return answer(await buyerHarvest.cancel(params.orderId), intent);
  return { fieldErrors: { _form: ["Acción desconocida."] }, intent };
}

export default function BuyerOrder({ loaderData, actionData }: Route.ComponentProps) {
  const { order, settlement } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/buyer/orders" className={linkClass}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a mis órdenes
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">Orden {orderCode(order.id)}</p>
        <h1 className="text-3xl text-primary">{order.projectTitle}</h1>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="min-w-0 lg:col-start-2 lg:row-start-1">
          <OrderSummary order={order} />
        </aside>
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <BuyerOrderActions order={order} actionData={actionData} />
          <section aria-labelledby="timeline-title" className="flex flex-col gap-3 rounded-lg border bg-card p-5">
            <h2 id="timeline-title" className="text-lg text-primary">
              Avance de la orden
            </h2>
            <OrderTimeline order={order} />
          </section>
          {settlement && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg text-primary">Así se repartió tu pago</h2>
              <SettlementTable settlement={settlement} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos esta orden" failureTitle="No pudimos cargar la orden" backTo="/buyer/orders" backLabel="Volver a mis órdenes" />;
}
