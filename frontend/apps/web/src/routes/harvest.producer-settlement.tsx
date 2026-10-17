import { ArrowLeft, FileDown } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { ProducerStatement } from "~/components/harvest/account-statement";
import { linkClass } from "~/components/harvest/format";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { unwrap } from "~/harvest/action-data";
import { producerHarvest } from "~/harvest/module";
import type { Route } from "./+types/harvest.producer-settlement";

export const meta = () => [{ title: "Estado de cuenta final · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return { projectId: params.projectId, settlements: unwrap(await producerHarvest.listSettlements(params.projectId)) };
}

export default function ProducerSettlement({ loaderData }: Route.ComponentProps) {
  const { projectId, settlements } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to={`/producer/projects/${projectId}/harvest`} className={linkClass}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a la cosecha
      </Link>
      <header>
        {settlements[0] && <p className="text-sm text-muted-foreground">{settlements[0].projectTitle}</p>}
        <h1 className="text-3xl text-primary">Estado de cuenta final</h1>
        <p className="mt-2 text-muted-foreground">Cómo se repartió cada venta: comisión, inversor y tu utilidad neta, con el comprobante de cada pago.</p>
        <Button asChild variant="outline" size="compact" className="mt-3">
          <Link to={`/producer/projects/${projectId}/statement`}>
            <FileDown aria-hidden="true" />
            Descargar estado de cuenta
          </Link>
        </Button>
      </header>
      {settlements.length === 0 ? (
        <p role="status" className="rounded-lg border bg-card p-5 text-muted-foreground">
          Todavía no hay ventas liquidadas para este proyecto. El estado de cuenta aparece cuando el comprador confirma la recepción.
        </p>
      ) : (
        <ProducerStatement settlements={settlements} />
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos este proyecto" failureTitle="No pudimos cargar el estado de cuenta" backTo="/producer" backLabel="Volver a mis proyectos" />;
}
