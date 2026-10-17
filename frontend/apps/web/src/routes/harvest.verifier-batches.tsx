import { ArrowRight } from "lucide-react";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Link } from "react-router";
import { formatKg } from "@agro/shared/modules/harvest-batches/domain/harvest";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDate } from "~/components/harvest/format";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { HarvestStatusBadge } from "~/components/harvest/status";
import { unwrap } from "~/harvest-batches/action-data";
import { verifierHarvest } from "~/harvest-batches/module";
import type { Route } from "./+types/harvest.verifier-batches";

export const meta = () => [{ title: "Cosechas por certificar · Surco" }];

export async function clientLoader(_args: Route.ClientLoaderArgs) {
  return unwrap(await verifierHarvest.listQueue());
}

export default function VerifierHarvests({ loaderData: batches }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Cosechas por certificar</h1>
        <p className="mt-2 text-muted-foreground">Certifica la cantidad y la calidad de lo cosechado antes de que el lote salga al mercado.</p>
      </header>
      {batches.length === 0 ? (
        <p role="status" className="rounded-lg border bg-card p-5 text-muted-foreground">
          No hay cosechas esperando certificación.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4">
          {batches.map((b) => (
            <li key={b.id} className="min-w-0">
              <Card className="h-full">
                <CardHeader>
                  <p className="text-sm text-muted-foreground">
                    {productionTypeLabel(b.productionType)} · {b.producerName}
                  </p>
                  <CardTitle className="break-words text-lg text-primary">{b.projectTitle}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <HarvestStatusBadge status={b.status} />
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Volumen declarado</dt>
                      <dd className="font-semibold tabular-nums">{formatKg(b.declaredKg)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Declarada el</dt>
                      <dd className="tabular-nums">{formatDate(b.declaredAt)}</dd>
                    </div>
                  </dl>
                  <Button asChild size="compact" className="self-start">
                    <Link to={`/verifier/harvests/${b.id}`}>
                      Revisar cosecha
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
  return <HarvestRouteError notFoundTitle="No encontramos las cosechas" failureTitle="No pudimos cargar las cosechas" backTo="/verifier" backLabel="Volver al panel" />;
}
