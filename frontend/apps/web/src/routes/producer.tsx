import { Handshake, Megaphone, MessageCircle, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import type { ProjectOverview } from "@agro/shared/modules/projects/application/use-cases";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@agro/shared/ui/tabs";
import { ALL_TYPES, TypeFilter } from "~/components/buyer/type-filter";
import { DashboardSummary } from "~/components/producer/dashboard-summary";
import { ProjectCard } from "~/components/producer/project-card";
import { errorMessage } from "~/producer/error-copy";
import { DASHBOARD_CURRENCY, producer } from "~/producer/module";
import type { Route } from "./+types/producer";

export const meta = () => [{ title: "Mis proyectos · Surco" }];

const TABS = ["active", "finished", "drafts"] as const;
type Tab = (typeof TABS)[number];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const params = new URL(request.url).searchParams;
  const typeParam = params.get("type");
  const selected = typeParam && typeParam !== ALL_TYPES ? typeParam : null;
  const tabParam = params.get("tab");
  const tab: Tab = TABS.find((t) => t === tabParam) ?? "active";

  const result = await producer.getProducerDashboard();
  if (!result.ok) throw new Response(errorMessage(result.error), { status: 502 });
  const { summary, drafts, active, finished } = result.value;

  // Options come from the production types actually present, so there is never an option with no results.
  const types = [...new Set([...drafts, ...active, ...finished].map((o) => o.project.productionType))].sort();
  // The filter narrows the lists only; the summary keeps reflecting every project.
  const only = (items: ProjectOverview[]) => (selected ? items.filter((o) => o.project.productionType === selected) : items);
  return { summary, drafts: only(drafts), active: only(active), finished: only(finished), types, selected, tab };
}

function ProjectList({ items, empty, filtered }: { items: ProjectOverview[]; empty: string; filtered: boolean }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-5 text-muted-foreground">
        {filtered ? "No hay proyectos de este tipo en esta pestaña. Usa «Limpiar filtro» para ver todos." : empty}
      </p>
    );
  }
  return (
    <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
      {items.map((o) => (
        <ProjectCard key={o.project.id} overview={o} />
      ))}
    </ul>
  );
}

export default function Producer({ loaderData }: Route.ComponentProps) {
  const { summary, drafts, active, finished, types, selected, tab: initialTab } = loaderData;
  // The active tab travels with the filter (hidden field and clear link) so filtering never resets it.
  const [tab, setTab] = useState<string>(initialTab);
  const filtered = selected !== null;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-primary">Mis proyectos</h1>
          <p className="mt-2 text-muted-foreground">Sigue la cotización y el avance de cada proyecto.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="compact">
            <Link to="/producer/assistant">
              <MessageCircle aria-hidden="true" />
              Asistente
            </Link>
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to="/producer/negotiations">
              <Handshake aria-hidden="true" />
              Negociaciones
            </Link>
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to="/producer/open-requests">
              <Megaphone aria-hidden="true" />
              Solicitudes abiertas
            </Link>
          </Button>
          <Button asChild size="compact">
            <Link to="/producer/projects/new">
              <Plus aria-hidden="true" />
              Nuevo proyecto
            </Link>
          </Button>
        </div>
      </header>

      <DashboardSummary summary={summary} currency={DASHBOARD_CURRENCY} />

      {types.length > 0 && (
        <TypeFilter key={selected ?? "all"} types={types} selected={selected} clearTo={`/producer?tab=${tab}`} hidden={{ tab }} />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Activos ({active.length})</TabsTrigger>
          <TabsTrigger value="finished">Terminados ({finished.length})</TabsTrigger>
          <TabsTrigger value="drafts">Borradores ({drafts.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <ProjectList items={active} empty="No tienes proyectos activos." filtered={filtered} />
        </TabsContent>
        <TabsContent value="finished" className="mt-4">
          <ProjectList items={finished} empty="Aún no tienes proyectos terminados." filtered={filtered} />
        </TabsContent>
        <TabsContent value="drafts" className="mt-4">
          <ProjectList items={drafts} empty="Aún no tienes borradores." filtered={filtered} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
