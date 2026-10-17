import { ArrowLeft } from "lucide-react";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Link, redirect } from "react-router";
import { formatKg } from "@agro/shared/modules/harvest/domain/harvest";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { CreateOrderForm } from "~/components/harvest/create-order-form";
import { formatDate, linkClass } from "~/components/harvest/format";
import { MetricsList } from "~/components/harvest/metrics-list";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { formFields, toActionData, unwrap, type HarvestActionData } from "~/harvest/action-data";
import { buyerHarvest } from "~/harvest/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/harvest.lot";

export const meta = () => [{ title: "Lote · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return unwrap(await buyerHarvest.getLot(params.batchId));
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<HarvestActionData | Response> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const result = await buyerHarvest.createOrder(params.batchId, formFields(await request.formData()));
  return result.ok ? redirect(`/buyer/orders/${result.value.id}`) : toActionData(result.error, "create-order");
}

export default function Lot({ loaderData: lot, actionData }: Route.ComponentProps) {
  const certified = lot.certifiedMetrics ?? lot.qualityMetrics;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/buyer/marketplace" className={linkClass}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al mercado
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">
          {productionTypeLabel(lot.productionType)} · {lot.producerName}
        </p>
        <h1 className="text-3xl text-primary">{lot.projectTitle}</h1>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="min-w-0 lg:col-start-2 lg:row-start-1">
          <section aria-labelledby="order-title" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
            <h2 id="order-title" className="text-lg text-primary">
              Comprar este lote
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Precio por kilo</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(lot.askingPricePerKg, lot.currency)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Disponible</dt>
                <dd className="font-semibold tabular-nums">{formatKg(lot.availableKg)}</dd>
              </div>
            </dl>
            <CreateOrderForm lot={lot} actionData={actionData} />
            <p className="text-sm text-muted-foreground">Crear la orden no te cobra nada: el siguiente paso es autorizar el pago, y tu dinero sigue en tu billetera hasta que confirmes la recepción.</p>
          </section>
        </aside>
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
            <h2 className="text-lg text-primary">Calidad certificada</h2>
            <MetricsList metrics={certified} />
            {lot.certifiedKg !== null && (
              <p className="text-sm text-muted-foreground">
                Peso certificado: <span className="font-semibold tabular-nums">{formatKg(lot.certifiedKg)}</span>
              </p>
            )}
          </section>
          {lot.certification && (
            <section className="rounded-lg border bg-card p-5 text-sm">
              <h2 className="mb-2 text-lg text-primary">Dictamen del verificador</h2>
              <p>
                <span className="font-semibold">{lot.certification.verifierName}</span> · <span className="tabular-nums">{formatDate(lot.certification.certifiedAt)}</span>
              </p>
              <p className="mt-1 text-muted-foreground">{lot.certification.comments}</p>
              <p className="mt-1 break-all text-muted-foreground">Firma: {lot.certification.signatureHash}</p>
            </section>
          )}
          {lot.notes && <p className="text-muted-foreground">{lot.notes}</p>}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos este lote" failureTitle="No pudimos cargar el lote" backTo="/buyer/marketplace" backLabel="Volver al mercado" />;
}
