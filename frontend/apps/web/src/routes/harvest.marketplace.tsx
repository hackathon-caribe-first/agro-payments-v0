import { Link } from "react-router";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { LotCard } from "~/components/harvest/lot-card";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { unwrap } from "~/harvest/action-data";
import { buyerHarvest } from "~/harvest/module";
import type { Route } from "./+types/harvest.marketplace";

export const meta = () => [{ title: "Mercado de cosechas · Surco" }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const type = new URL(request.url).searchParams.get("type") ?? undefined;
  const [lots, all] = await Promise.all([buyerHarvest.listLots(type), buyerHarvest.listLots()]);
  // Filter chips come from the unfiltered list so selecting one never hides the others.
  const types = [...new Set(unwrap(all).map((l) => l.productionType))].sort((a, b) => a.localeCompare(b, "es"));
  return { lots: unwrap(lots), types, type };
}

export default function Marketplace({ loaderData }: Route.ComponentProps) {
  const { lots, types, type } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Mercado de cosechas</h1>
        <p className="mt-2 text-muted-foreground">Lotes certificados por un verificador, listos para comprar. Pagas solo cuando confirmas la recepción.</p>
      </header>
      {types.length > 0 && (
        <nav aria-label="Filtrar por tipo de producción" className="flex flex-wrap items-center gap-2 text-sm">
          <Link to="/buyer/marketplace" aria-current={type ? undefined : "page"} className={`rounded-sm border px-3 py-1.5 font-semibold ${type ? "" : "bg-secondary text-primary"}`}>
            Todos
          </Link>
          {types.map((t) => (
            <Link
              key={t}
              to={`/buyer/marketplace?type=${encodeURIComponent(t)}`}
              aria-current={type?.toLowerCase() === t.toLowerCase() ? "page" : undefined}
              className={`rounded-sm border px-3 py-1.5 font-semibold ${type?.toLowerCase() === t.toLowerCase() ? "bg-secondary text-primary" : ""}`}
            >
              {productionTypeLabel(t)}
            </Link>
          ))}
        </nav>
      )}
      {lots.length === 0 ? (
        <p role="status" className="rounded-lg border bg-card p-5 text-muted-foreground">
          {type ? `No hay lotes de ${type} disponibles por ahora.` : "No hay lotes disponibles por ahora."}
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4">
          {lots.map((lot) => (
            <LotCard key={lot.id} lot={lot} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos el mercado" failureTitle="No pudimos cargar el mercado" backTo="/buyer" backLabel="Volver al inicio" />;
}
