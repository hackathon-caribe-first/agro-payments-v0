import { ArrowLeft, Handshake } from "lucide-react";
import { useEffect } from "react";
import { Link, data, isRouteErrorResponse, redirect, useLocation, useRouteError } from "react-router";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { availableQuantity } from "@agro/shared/modules/presales/domain/presale-rules";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Progress } from "@agro/shared/ui/progress";
import { RequestQuoteForm } from "~/components/buyer/request-quote-form";
import { AvailabilityMeter } from "~/components/presale/availability-meter";
import { presaleErrorMessage, toActionData, type PresaleActionData } from "~/components/presale/error-copy";
import { formatDay, formatQuantity, unitText } from "~/components/presale/format";
import { ListingStatusBadge } from "~/components/presale/status-badges";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { buyer } from "~/buyer/module";
import type { Route } from "./+types/buyer.project";

export const meta = () => [{ title: "Proyecto · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await buyer.getListingDetail(params.listingId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<PresaleActionData | Response> {
  const form = await request.formData();
  const result = await buyer.requestQuote(params.listingId, {
    quantity: text(form, "quantity"),
    desiredDeliveryDate: text(form, "desiredDeliveryDate"),
    notes: text(form, "notes"),
  });
  return result.ok ? redirect(`/buyer/negotiations/${result.value.id}`) : toActionData(result.error);
}

export default function BuyerProject({ loaderData, actionData }: Route.ComponentProps) {
  const { hash } = useLocation();
  // Arriving from the catalog (#request-form): bring the form into view and focus its first field.
  useEffect(() => {
    if (hash !== "#request-form") return;
    const card = document.getElementById("request-form");
    card?.scrollIntoView({ block: "start" });
    card?.querySelector<HTMLElement>("input, textarea, select")?.focus({ preventScroll: true });
  }, [hash]);
  const { listing, project, progress, canRequest } = loaderData;
  const available = availableQuantity(listing);
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
          <p className="text-sm text-muted-foreground">{productionTypeLabel(listing.productionType)}</p>
          <h1 className="break-words text-3xl text-primary">{listing.title}</h1>
          <p className="mt-2 text-pretty text-muted-foreground">{listing.summary}</p>
        </div>
        <ListingStatusBadge status={listing.status} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <p className="text-sm text-muted-foreground">{project.projectCode}</p>
              <CardTitle className="break-words text-base text-primary">{project.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4">
              <ProjectStatusBadge status={project.currentStatus} />
              <p className="text-pretty text-sm text-muted-foreground">{project.description}</p>
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
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-primary">Producción ofrecida</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Cantidad esperada</dt>
                  <dd className="font-semibold tabular-nums">{formatQuantity(listing.expectedQuantity, listing)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Precio de referencia</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatMoney(listing.referenceUnitPrice, listing.currency)} / {unitText(listing, 1)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cosecha estimada</dt>
                  <dd className="font-semibold">{formatDay(listing.estimatedHarvestDate)}</dd>
                </div>
              </dl>
              <AvailabilityMeter listing={listing} />
            </CardContent>
          </Card>

          <Card id="request-form" className="scroll-mt-4">
            <CardHeader>
              <CardTitle className="text-lg text-primary">Solicitar cotización</CardTitle>
            </CardHeader>
            <CardContent>
              {canRequest ? (
                <RequestQuoteForm available={available} unitText={unitText(listing, 2)} actionData={actionData} />
              ) : (
                <p className="text-muted-foreground">
                  {available <= 0 ? "Sin disponibilidad: ya no se pueden solicitar cotizaciones." : "Este proyecto ya no recibe solicitudes."}
                </p>
              )}
            </CardContent>
          </Card>
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
        {notFound ? "Puede que el enlace sea incorrecto o que el proyecto ya no esté publicado." : "Intenta de nuevo en unos minutos."}
      </p>
      <Link to="/buyer" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a los proyectos
      </Link>
    </>
  );
}
