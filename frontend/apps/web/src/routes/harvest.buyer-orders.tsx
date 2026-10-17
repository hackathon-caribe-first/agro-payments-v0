import { Store } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { OrderCard } from "~/components/harvest/order-card";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { unwrap } from "~/harvest-batches/action-data";
import { buyerHarvest } from "~/harvest-batches/module";
import type { Route } from "./+types/harvest.buyer-orders";

export const meta = () => [{ title: "Mis órdenes · Surco" }];

export async function clientLoader(_args: Route.ClientLoaderArgs) {
  return unwrap(await buyerHarvest.listOrders());
}

export default function BuyerOrders({ loaderData: orders }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-primary">Mis órdenes</h1>
          <p className="mt-2 text-muted-foreground">Autoriza el pago, confirma la recepción y consulta cómo se repartió cada compra.</p>
        </div>
        <Button asChild variant="outline" size="compact">
          <Link to="/buyer/marketplace">
            <Store aria-hidden="true" />
            Ir al mercado
          </Link>
        </Button>
      </header>
      {orders.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no tienes órdenes de compra.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} to={`/buyer/orders/${order.id}`} counterpart={order.producerName} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos tus órdenes" failureTitle="No pudimos cargar tus órdenes" backTo="/buyer" backLabel="Volver al inicio" />;
}
