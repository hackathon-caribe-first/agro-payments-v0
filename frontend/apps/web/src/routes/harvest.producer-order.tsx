import { ArrowLeft, ReceiptText } from "lucide-react";
import { Link } from "react-router";
import { DispatchForm } from "~/components/harvest/dispatch-form";
import { linkClass, orderCode } from "~/components/harvest/format";
import { LiquidationPreview } from "~/components/harvest/liquidation-preview";
import { OrderSummary } from "~/components/harvest/order-summary";
import { OrderTimeline } from "~/components/harvest/order-timeline";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { SettlementTable } from "~/components/harvest/settlement-table";
import { answer, formFields, unwrap, type HarvestActionData } from "~/harvest/action-data";
import { producerHarvest } from "~/harvest/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/harvest.producer-order";

export const meta = () => [{ title: "Orden de compra · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return unwrap(await producerHarvest.getOrderDetail(params.orderId));
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<HarvestActionData> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "dispatch") return answer(await producerHarvest.dispatch(params.orderId, formFields(form)), intent);
  return { fieldErrors: { _form: ["Acción desconocida."] }, intent };
}

export default function ProducerOrder({ loaderData, actionData }: Route.ComponentProps) {
  const { order, settlement } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/producer/orders" className={linkClass}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a las órdenes
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
          <section aria-labelledby="timeline-title" className="flex flex-col gap-3 rounded-lg border bg-card p-5">
            <h2 id="timeline-title" className="text-lg text-primary">
              Avance de la orden
            </h2>
            <OrderTimeline order={order} />
          </section>
          <DispatchForm order={order} actionData={actionData} />
          {order.status === "DISPATCHED" && order.grant.state === "LIVE" && (
            <p role="status" className="rounded-lg border bg-card p-5 text-muted-foreground">
              ◷ Despachada. Cuando el comprador confirme la recepción, la Plataforma liquida la venta.
            </p>
          )}
          {settlement ? (
            <>
              <SettlementTable settlement={settlement} />
              <Link to={`/producer/projects/${order.projectId}/settlement`} className={linkClass}>
                <ReceiptText aria-hidden="true" className="size-4" />
                Ver estado de cuenta final
              </Link>
            </>
          ) : order.status !== "CANCELLED" ? (
            <LiquidationPreview order={order} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos esta orden" failureTitle="No pudimos cargar la orden" backTo="/producer/orders" backLabel="Volver a las órdenes" />;
}
