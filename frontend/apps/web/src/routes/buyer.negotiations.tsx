import { Megaphone } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { RequestListItem } from "~/components/buyer/request-list-item";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { buyer } from "~/buyer/module";
import type { Route } from "./+types/buyer.negotiations";

export const meta = () => [{ title: "Mis negociaciones · Surco" }];

export async function clientLoader() {
  const result = await buyer.listMyRequests();
  if (!result.ok) throw new Response(presaleErrorMessage(result.error), { status: 502 });
  return result.value;
}

export default function BuyerNegotiations({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-primary">Mis negociaciones</h1>
          <p className="mt-2 text-muted-foreground">Sigue cada negociación, responde con una contraoferta o acepta la oferta vigente.</p>
        </div>
        <Button asChild variant="outline" size="compact">
          <Link to="/buyer/open-requests">
            <Megaphone aria-hidden="true" />
            Solicitudes abiertas
          </Link>
        </Button>
      </header>
      {loaderData.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">
          Aún no tienes negociaciones. Inicia una negociación desde un proyecto o pide una cotización.
        </p>
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
