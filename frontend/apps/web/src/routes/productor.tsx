import { FileText, Plus } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import type { ProjectOverview } from "@agro/shared/modules/projects/application/use-cases";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@agro/shared/ui/tabs";
import { DashboardSummary } from "~/components/producer/dashboard-summary";
import { ProjectCard } from "~/components/producer/project-card";
import { errorMessage } from "~/producer/error-copy";
import { DASHBOARD_CURRENCY, producer } from "~/producer/module";
import type { Route } from "./+types/productor";

export const meta = () => [{ title: "Mis proyectos · Surco" }];

export async function clientLoader() {
  const result = await producer.getProducerDashboard();
  if (!result.ok) throw new Response(errorMessage(result.error), { status: 502 });
  return result.value;
}

function ProjectList({ items, empty }: { items: ProjectOverview[]; empty: string }) {
  if (items.length === 0) {
    return <p className="rounded-lg border bg-card p-5 text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
      {items.map((o) => (
        <ProjectCard key={o.project.id} overview={o} />
      ))}
    </ul>
  );
}

export default function Productor({ loaderData }: Route.ComponentProps) {
  const { summary, drafts, active, finished } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-primary">Mis proyectos</h1>
          <p className="mt-2 text-muted-foreground">Sigue la cotización y el avance de cada proyecto.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="compact">
            <Link to="/productor/solicitudes">
              <FileText aria-hidden="true" />
              Solicitudes
            </Link>
          </Button>
          <Button asChild size="compact">
            <Link to="/productor/proyectos/nuevo">
              <Plus aria-hidden="true" />
              Nuevo proyecto
            </Link>
          </Button>
        </div>
      </header>

      <DashboardSummary summary={summary} currency={DASHBOARD_CURRENCY} />

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Activos ({active.length})</TabsTrigger>
          <TabsTrigger value="finished">Terminados ({finished.length})</TabsTrigger>
          <TabsTrigger value="drafts">Borradores ({drafts.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <ProjectList items={active} empty="No tienes proyectos activos." />
        </TabsContent>
        <TabsContent value="finished" className="mt-4">
          <ProjectList items={finished} empty="Aún no tienes proyectos terminados." />
        </TabsContent>
        <TabsContent value="drafts" className="mt-4">
          <ProjectList items={drafts} empty="Aún no tienes borradores." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
