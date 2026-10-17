import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { CaptureBar, SimulationNotice } from "~/components/investor/capture-bar";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { investor } from "~/investor/module";
import type { Route } from "./+types/investor";

export const meta = () => [{ title: "Inversionista · Surco" }];

export async function clientLoader() {
  const result = await investor.listFundable();
  if (!result.ok) throw new Response("No pudimos cargar los proyectos en captación.", { status: 502 });
  return result.value;
}

export default function Investor({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Proyectos en captación</h1>
        <p className="mt-2 text-muted-foreground">Invierte en pesos desde tu billetera, en la moneda que tengas. La conversión queda registrada.</p>
        <SimulationNotice />
      </header>
      {loaderData.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Por ahora no hay proyectos en captación.</p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {loaderData.map(({ project, capture }) => (
            <li key={project.id} className="min-w-0">
              <Card className="h-full">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">{productionTypeLabel(project.productionType)}</p>
                      <CardTitle className="break-words text-lg text-primary">{project.title}</CardTitle>
                    </div>
                    <ProjectStatusBadge status={project.currentStatus} />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="line-clamp-3 text-pretty text-sm text-muted-foreground">{project.description}</p>
                  <CaptureBar capture={capture} />
                  <Button asChild size="compact" className="self-start">
                    <Link to={`/investor/projects/${project.id}`}>
                      Ver e invertir
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
