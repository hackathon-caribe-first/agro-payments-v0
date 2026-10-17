import { ArrowLeft, FileDown } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { InvestorBalance } from "~/components/harvest/account-statement";
import { linkClass, orderCode } from "~/components/harvest/format";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { SettlementTable } from "~/components/harvest/settlement-table";
import { unwrap } from "~/harvest/action-data";
import { investorHarvest } from "~/harvest/module";
import type { Route } from "./+types/harvest.investor-settlement";

export const meta = () => [{ title: "Balance de inversión · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return unwrap(await investorHarvest.listProjectSettlements(params.projectId));
}

export default function InvestorSettlement({ loaderData: settlements }: Route.ComponentProps) {
  const { projectId } = useParams();
  return (
    <div className="flex flex-col gap-6">
      <Link to="/investor/settlements" className={linkClass}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a las liquidaciones
      </Link>
      <header>
        {settlements[0] && <p className="text-sm text-muted-foreground">{settlements[0].projectTitle}</p>}
        <h1 className="text-3xl text-primary">Balance de inversión</h1>
        <Button asChild variant="outline" size="compact" className="mt-3">
          <Link to={`/investor/settlements/${projectId}/statement`}>
            <FileDown aria-hidden="true" />
            Descargar estado de cuenta
          </Link>
        </Button>
      </header>
      {settlements.length === 0 ? (
        <p role="status" className="rounded-lg border bg-card p-5 text-muted-foreground">
          Este proyecto todavía no tiene ventas liquidadas.
        </p>
      ) : (
        <>
          <InvestorBalance settlements={settlements} />
          {settlements.map((s) => (
            <details key={s.id} className="rounded-lg border bg-card p-5">
              <summary className="cursor-pointer text-base font-semibold">Detalle de la orden {orderCode(s.orderId)}</summary>
              <div className="mt-4">
                <SettlementTable settlement={s} />
              </div>
            </details>
          ))}
        </>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos este proyecto" failureTitle="No pudimos cargar el balance" backTo="/investor/settlements" backLabel="Volver a las liquidaciones" />;
}
