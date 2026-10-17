import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { OpenRequestCard } from "~/components/open-request/card";
import { ALL, CatalogFilters } from "~/components/open-request/catalog-filters";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { producerPresales } from "~/producer/presales";
import type { Route } from "./+types/producer.open-requests";

export const meta = () => [{ title: "Solicitudes abiertas · Surco" }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const params = new URL(request.url).searchParams;
  const typeParam = params.get("type");
  const unitParam = params.get("unit");
  const selectedType = typeParam && typeParam !== ALL ? typeParam : null;
  const selectedUnit = unitParam && unitParam !== ALL ? unitParam : null;

  const result = await producerPresales.listOpenRequestCatalog();
  if (!result.ok) throw new Response(presaleErrorMessage(result.error), { status: 502 });

  // Filter options come from the types actually present, so there is never an option with no results.
  const types = [...new Set(result.value.map((e) => e.openRequest.productionType))].sort();
  const entries = result.value.filter(
    (e) => (!selectedType || e.openRequest.productionType === selectedType) && (!selectedUnit || e.openRequest.unit === selectedUnit),
  );
  return { entries, types, selectedType, selectedUnit, total: result.value.length };
}

export default function ProducerOpenRequests({ loaderData }: Route.ComponentProps) {
  const { entries, types, selectedType, selectedUnit, total } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/producer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a mis proyectos
      </Link>
      <header>
        <h1 className="text-3xl text-primary">Solicitudes abiertas</h1>
        <p className="mt-2 text-muted-foreground">Compradores que buscan producción. Elige una y ofrécele lo que tu proyecto puede entregar.</p>
      </header>

      {total > 0 && <CatalogFilters types={types} selectedType={selectedType} selectedUnit={selectedUnit} />}

      {total === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Por ahora no hay solicitudes abiertas.</p>
      ) : entries.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">
          No hay solicitudes abiertas con estos filtros. Usa «Limpiar filtros» para ver todas.
        </p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {entries.map((entry) => (
            <OpenRequestCard
              key={entry.openRequest.id}
              entry={entry}
              to={`/producer/open-requests/${entry.openRequest.id}`}
              actionLabel="Ver solicitud"
              showBuyer
            />
          ))}
        </ul>
      )}
    </div>
  );
}
