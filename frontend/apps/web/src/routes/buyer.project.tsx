import { ArrowLeft, Handshake } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { milestoneProgress } from "@agro/shared/modules/projects/domain/project-rules";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Progress } from "@agro/shared/ui/progress";
import { MilestoneNegotiationRow } from "~/components/buyer/milestone-negotiation-row";
import { startBlockText } from "~/components/buyer/project-card";
import { AgreementBanner } from "~/components/negotiation/agreement-banner";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { formatDay } from "~/components/presale/format";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { buyer } from "~/buyer/module";
import type { Route } from "./+types/buyer.project";

export const meta = () => [{ title: "Proyecto · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await buyer.getProjectDetail(params.projectId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

export default function BuyerProject({ loaderData }: Route.ComponentProps) {
  const { catalog, milestones, total, projectStartBlock, myLiveProjectId, agreement } = loaderData;
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
        <ProjectStatusBadge status={project.currentStatus} audience="buyer" />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
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
          {agreement && <AgreementBanner authorization={agreement.authorization} to={`/buyer/negotiations/${agreement.negotiationId}`} />}
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-primary">Negociar el proyecto</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-pretty text-sm text-muted-foreground">
                Propón cantidad, unidad, precio y fecha de entrega. Si el productor y tú llegan a un acuerdo, autorizas el pago del total de la cotización del proyecto.
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
