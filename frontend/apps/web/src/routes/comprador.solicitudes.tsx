import { RequestListItem } from "~/components/buyer/request-list-item";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { buyer } from "~/buyer/module";
import type { Route } from "./+types/comprador.solicitudes";

export const meta = () => [{ title: "Mis solicitudes · Surco" }];

export async function clientLoader() {
  const result = await buyer.listMyRequests();
  if (!result.ok) throw new Response(presaleErrorMessage(result.error), { status: 502 });
  return result.value;
}

export default function CompradorSolicitudes({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Mis solicitudes</h1>
        <p className="mt-2 text-muted-foreground">Sigue tus solicitudes de cotización y decide sobre las cotizaciones de venta recibidas.</p>
      </header>
      {loaderData.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no has enviado solicitudes de cotización.</p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {loaderData.map((entry) => (
            <RequestListItem key={entry.request.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
