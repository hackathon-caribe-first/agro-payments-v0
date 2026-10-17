import { Handshake, Megaphone, Plus } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { ALL_TYPES, TypeFilter } from "~/components/buyer/type-filter";
import { ProjectCard } from "~/components/buyer/project-card";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { buyer } from "~/buyer/module";
import type { Route } from "./+types/buyer";

export const meta = () => [{ title: "Proyectos · Surco" }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const typeParam = new URL(request.url).searchParams.get("type");
  const selected = typeParam && typeParam !== ALL_TYPES ? typeParam : null;

  const result = await buyer.listCatalog();
  if (!result.ok) throw new Response(presaleErrorMessage(result.error), { status: 502 });

  // Filter options come from the production types actually present, so there is never an option with no results.
  const types = [...new Set(result.value.map((e) => e.catalog.project.productionType))].sort();
  const entries = selected ? result.value.filter((e) => e.catalog.project.productionType === selected) : result.value;
  return { entries, types, selected, total: result.value.length };
}

export default function Buyer({ loaderData }: Route.ComponentProps) {
  const { entries, types, selected, total } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-primary">Proyectos</h1>
          <p className="mt-2 text-muted-foreground">Explora los proyectos e inicia una negociación con el productor.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="compact">
            <Link to="/buyer/open-requests/new">
              <Plus aria-hidden="true" />
              Pedir cotización
            </Link>
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to="/buyer/negotiations">
              <Handshake aria-hidden="true" />
              Mis negociaciones
            </Link>
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to="/buyer/open-requests">
              <Megaphone aria-hidden="true" />
              Solicitudes abiertas
            </Link>
          </Button>
        </div>
      </header>

      {total > 0 && <TypeFilter key={selected ?? "all"} types={types} selected={selected} />}

      {total === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Por ahora no hay proyectos.</p>
      ) : entries.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">
          No hay proyectos de este tipo de producción. Usa «Limpiar filtro» para ver todos.
        </p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {entries.map((entry) => (
            <ProjectCard key={entry.catalog.project.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
