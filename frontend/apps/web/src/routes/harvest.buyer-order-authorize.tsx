import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "react-router";
import { canAuthorize } from "@agro/shared/modules/harvest/domain/rules";
import { AuthorizePanel } from "~/components/harvest/authorize-panel";
import { linkClass, orderCode } from "~/components/harvest/format";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { formFields, toActionData, unwrap, type HarvestActionData } from "~/harvest/action-data";
import { buyerHarvest } from "~/harvest/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/harvest.buyer-order-authorize";

export const meta = () => [{ title: "Autorizar pago de la orden · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const { order } = unwrap(await buyerHarvest.getOrderDetail(params.orderId));
  // Nothing to authorize (already live, cancelled, settled): go back to the order.
  if (!canAuthorize(order)) throw redirect(`/buyer/orders/${order.id}`);
  return order;
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<HarvestActionData | Response> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const result = await buyerHarvest.authorize(params.orderId, formFields(await request.formData()));
  return result.ok ? redirect(`/buyer/orders/${params.orderId}`) : toActionData(result.error, "authorize");
}

export default function AuthorizeOrder({ loaderData: order, actionData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <Link to={`/buyer/orders/${order.id}`} className={linkClass}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a la orden
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">Orden {orderCode(order.id)}</p>
        <h1 className="text-3xl text-primary">Autorizar pago</h1>
      </header>
      <AuthorizePanel order={order} actionData={actionData} />
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos esta orden" failureTitle="No pudimos cargar la orden" backTo="/buyer/orders" backLabel="Volver a mis órdenes" />;
}
