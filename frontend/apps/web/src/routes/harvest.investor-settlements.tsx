import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { unwrap } from "~/harvest/action-data";
import { investorHarvest } from "~/harvest/module";
import type { Route } from "./+types/harvest.investor-settlements";

export const meta = () => [{ title: "Liquidaciones · Surco" }];

export async function clientLoader(_args: Route.ClientLoaderArgs) {
  const settlements = unwrap(await investorHarvest.listSettlements());
  // One entry per project, newest settlement first.
  const byProject = new Map<string, { projectId: string; title: string; count: number; loss: boolean }>();
  for (const s of [...settlements].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const entry = byProject.get(s.projectId);
    if (entry) {
      entry.count += 1;
      entry.loss ||= s.loss;
    } else byProject.set(s.projectId, { projectId: s.projectId, title: s.projectTitle, count: 1, loss: s.loss });
  }
  return [...byProject.values()];
}

export default function InvestorSettlements({ loaderData: projects }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Liquidaciones</h1>
        <p className="mt-2 text-muted-foreground">Capital y rendimiento recibidos de las ventas de cada proyecto que financiaste.</p>
      </header>
      {projects.length === 0 ? (
        <p role="status" className="rounded-lg border bg-card p-5 text-muted-foreground">
          Todavía no hay ventas liquidadas de tus proyectos.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4">
          {projects.map((p) => (
            <li key={p.projectId} className="min-w-0">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="break-words text-lg text-primary">{p.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    {p.count} {p.count === 1 ? "venta liquidada" : "ventas liquidadas"}
                    {p.loss ? " · el resultado fue una pérdida" : ""}
                  </p>
                  <Button asChild size="compact" className="self-start">
                    <Link to={`/investor/settlements/${p.projectId}`}>
                      Ver balance
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

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos las liquidaciones" failureTitle="No pudimos cargar las liquidaciones" backTo="/" backLabel="Volver al inicio" />;
}
