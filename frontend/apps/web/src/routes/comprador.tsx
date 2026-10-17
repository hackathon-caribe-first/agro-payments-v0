import { ClipboardList } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { ListingCard } from "~/components/buyer/listing-card";
import { ALL_TYPES, ListingFilter } from "~/components/buyer/listing-filter";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { buyer } from "~/buyer/module";
import type { Route } from "./+types/comprador";

export const meta = () => [{ title: "Preventas · Surco" }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const tipo = new URL(request.url).searchParams.get("tipo");
  const selected = tipo && tipo !== ALL_TYPES ? tipo : null;

  const result = await buyer.listOpenListings();
  if (!result.ok) throw new Response(presaleErrorMessage(result.error), { status: 502 });

  // Filter options come from the production types actually present, so there is never an option with no results.
  const types = [...new Set(result.value.map((e) => e.listing.productionType))].sort();
  const entries = selected ? result.value.filter((e) => e.listing.productionType === selected) : result.value;
  return { entries, types, selected, total: result.value.length };
}

export default function Comprador({ loaderData }: Route.ComponentProps) {
  const { entries, types, selected, total } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-primary">Preventas</h1>
          <p className="mt-2 text-muted-foreground">Asegura producción futura y solicita una cotización de venta al productor.</p>
        </div>
        <Button asChild variant="outline" size="compact">
          <Link to="/comprador/solicitudes">
            <ClipboardList aria-hidden="true" />
            Mis solicitudes
          </Link>
        </Button>
      </header>

      {total > 0 && <ListingFilter types={types} selected={selected} />}

      {total === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Por ahora no hay preventas abiertas.</p>
      ) : entries.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">
          No hay preventas abiertas para este tipo de producción. Usa «Limpiar filtro» para ver todas.
        </p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {entries.map((entry) => (
            <ListingCard key={entry.listing.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
