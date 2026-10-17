import { Plus } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { OpenRequestCard } from "~/components/open-request/card";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { buyer } from "~/buyer/module";
import type { Route } from "./+types/buyer.open-requests";

export const meta = () => [{ title: "Solicitudes abiertas · Surco" }];

export async function clientLoader() {
  const result = await buyer.listMyOpenRequests();
  if (!result.ok) throw new Response(presaleErrorMessage(result.error), { status: 502 });
  return result.value;
}

export default function BuyerOpenRequests({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-primary">Solicitudes abiertas</h1>
          <p className="mt-2 text-muted-foreground">Publica lo que necesitas y deja que varios productores te hagan una oferta.</p>
        </div>
        <Button asChild size="compact">
          <Link to="/buyer/open-requests/new">
            <Plus aria-hidden="true" />
            Nueva solicitud abierta
          </Link>
        </Button>
      </header>
      {loaderData.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no has publicado solicitudes abiertas.</p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {loaderData.map((entry) => (
            <OpenRequestCard
              key={entry.openRequest.id}
              entry={entry}
              to={`/buyer/open-requests/${entry.openRequest.id}`}
              actionLabel="Ver solicitud"
            />
          ))}
        </ul>
      )}
    </div>
  );
}
