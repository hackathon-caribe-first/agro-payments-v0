import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { linkClass } from "~/components/harvest/format";
import { OrderCard } from "~/components/harvest/order-card";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { unwrap } from "~/harvest/action-data";
import { producerHarvest } from "~/harvest/module";
import type { Route } from "./+types/harvest.producer-orders";

export const meta = () => [{ title: "Órdenes de compra · Surco" }];

export async function clientLoader(_args: Route.ClientLoaderArgs) {
  return unwrap(await producerHarvest.listOrders());
}

export default function ProducerOrders({ loaderData: orders }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <Link to="/producer" className={linkClass}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a mis proyectos
      </Link>
      <header>
        <h1 className="text-3xl text-primary">Órdenes de compra</h1>
        <p className="mt-2 text-muted-foreground">Despacha las órdenes con pago autorizado y sigue su liquidación.</p>
      </header>
      {orders.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no tienes órdenes de compra.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} to={`/producer/orders/${order.id}`} counterpart={order.buyerName} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos tus órdenes" failureTitle="No pudimos cargar tus órdenes" backTo="/producer" backLabel="Volver a mis proyectos" />;
}
