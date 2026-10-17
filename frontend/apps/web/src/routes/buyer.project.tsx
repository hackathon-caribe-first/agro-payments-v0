import { ArrowLeft, Handshake } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError, useSearchParams } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { milestoneProgress } from "@agro/shared/modules/projects/domain/project-rules";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Progress } from "@agro/shared/ui/progress";
import { MilestoneNegotiationRow } from "~/components/buyer/milestone-negotiation-row";
import { startBlockText } from "~/components/buyer/project-card";
import { HarvestCard, HarvestStepForm } from "~/components/harvest/harvest-card";
import { AgreementBanner } from "~/components/negotiation/agreement-banner";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { formatDay } from "~/components/presale/format";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { buyer } from "~/buyer/module";
import { harvest, harvestAction } from "~/harvest/module";
import type { Route } from "./+types/buyer.project";

export const meta = () => [{ title: "Proyecto · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [result, harvestRead] = await Promise.all([buyer.getProjectDetail(params.projectId), harvest.get(params.projectId)]);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  // RF-24: optional; the page renders without the harvest.
  return { ...result.value, harvest: harvestRead.ok ? harvestRead.value.harvest : null };
}

export const clientAction = async ({ request }: Route.ClientActionArgs) => harvestAction(await request.formData());

// The buyer's wallet sends them back here with ?harvest_payment=ok|error (Open Payments mode).
function HarvestPaymentResult() {
  const [params] = useSearchParams();
  const result = params.get("harvest_payment");
  if (result === "ok") {
    return (
      <p role="status" className="rounded-md bg-secondary px-4 py-3 font-semibold text-primary">
        Tu pago de la cosecha quedó en la custodia del proyecto. Confirma la recepción cuando recibas el producto.
      </p>
    );
  }
  if (result === "error") {
    return (
      <p role="alert" className="rounded-md border border-destructive bg-card px-4 py-3 font-semibold text-destructive">
        ✕ No se completó el pago de la cosecha: no aprobaste el permiso en tu billetera o el pago falló. Puedes intentarlo de nuevo.
      </p>
    );
  }
  return null;
}

// Pay into custody (held), then confirm reception: two separate steps, never one green check.
function BuyerHarvest({ projectId, harvest: h }: { projectId: string; harvest: NonNullable<Route.ComponentProps["loaderData"]["harvest"]> }) {
  return (
    <HarvestCard title="Cosecha del proyecto" harvest={h}>
      {h.status === "DECLARED" && <p className="text-sm text-muted-foreground">El verificador aún debe certificar la cantidad y la calidad.</p>}
      {h.status === "CERTIFIED" && (
        <>
          <p className="text-sm text-muted-foreground">El pago va a la custodia del proyecto y queda retenido hasta que confirmes la recepción.</p>
          <HarvestStepForm projectId={projectId} intent="pay-harvest" label="Pagar la cosecha a la custodia" />
        </>
      )}
      {h.status === "PAID" && <HarvestStepForm projectId={projectId} intent="receive-harvest" label="Confirmar recepción" />}
    </HarvestCard>
  );
}

export default function BuyerProject({ loaderData }: Route.ComponentProps) {
  const { catalog, milestones, total, projectStartBlock, myLiveProjectId, agreement, harvest: projectHarvest } = loaderData;
  const { project } = catalog;
  const progress = milestoneProgress(milestones.map((m) => m.summary));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/buyer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Volver a los proyectos
        </Link>
        <Button asChild variant="outline" size="compact">
          <Link to="/buyer/negotiations">
            <Handshake aria-hidden="true" />
            Mis negociaciones
          </Link>
        </Button>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {productionTypeLabel(project.productionType)}
            {catalog.producerName ? ` · ${catalog.producerName}` : ""}
          </p>
          <h1 className="break-words text-3xl text-primary">{project.title}</h1>
          <p className="mt-2 text-pretty text-muted-foreground">{project.description}</p>
        </div>
        <ProjectStatusBadge status={project.currentStatus} />
      </header>

      <HarvestPaymentResult />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {projectHarvest && <BuyerHarvest projectId={project.id} harvest={projectHarvest} />}
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <p className="text-sm text-muted-foreground">{project.projectCode}</p>
              <CardTitle className="break-words text-base text-primary">{project.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4">
              <p aria-live="polite" className="text-sm text-muted-foreground">
                Total de la cotización del proyecto:{" "}
                <span className="font-semibold tabular-nums text-foreground">{formatMoney(total, project.currency)}</span>
              </p>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Inicio</dt>
                  <dd className="font-semibold">{formatDay(project.startDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Fin estimado</dt>
                  <dd className="font-semibold">{formatDay(project.estimatedEndDate)}</dd>
                </div>
              </dl>
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold">Avance de hitos</span>
                  <span className="tabular-nums text-muted-foreground">
                    {progress.completed} de {progress.total} hitos · {progress.percent} %
                  </span>
                </div>
                <Progress value={progress.percent} aria-label={`Avance de hitos: ${progress.percent} %`} />
              </div>
            </CardContent>
          </Card>
          {agreement && <AgreementBanner deposit={agreement.deposit} to={`/buyer/negotiations/${agreement.negotiationId}`} />}
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-primary">Negociar el proyecto</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-pretty text-sm text-muted-foreground">
                Propón cantidad, unidad, precio y fecha de entrega. Si el productor y tú llegan a un acuerdo, depositas el total de la cotización del proyecto en la fiducia.
              </p>
              {projectStartBlock === null ? (
                <Button asChild size="compact" className="self-start">
                  <Link to={`/buyer/projects/${project.id}/negotiations/new`}>
                    <Handshake aria-hidden="true" />
                    Iniciar negociación
                  </Link>
                </Button>
              ) : projectStartBlock === "duplicate" && myLiveProjectId ? (
                <Button asChild size="compact" className="self-start">
                  <Link to={`/buyer/negotiations/${myLiveProjectId}`}>
                    <Handshake aria-hidden="true" />
                    Ver negociación
                  </Link>
                </Button>
              ) : (
                <p role="status" className="text-muted-foreground">
                  {startBlockText(projectStartBlock, project)}
                </p>
              )}
            </CardContent>
          </Card>

          <section aria-labelledby="milestones-heading" className="flex flex-col gap-3">
            <h2 id="milestones-heading" className="text-lg text-primary">
              Hitos
            </h2>
            {milestones.length === 0 ? (
              <p className="rounded-lg border bg-card p-5 text-muted-foreground">Este proyecto aún no tiene hitos.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {milestones.map((row) => (
                  <MilestoneNegotiationRow key={row.summary.id} row={row} project={project} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar el proyecto"}</h1>
      <p className="mt-2 text-muted-foreground">
        {notFound ? "Puede que el enlace sea incorrecto o que el proyecto ya no esté disponible." : "Intenta de nuevo en unos minutos."}
      </p>
      <Link to="/buyer" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a los proyectos
      </Link>
    </>
  );
}
