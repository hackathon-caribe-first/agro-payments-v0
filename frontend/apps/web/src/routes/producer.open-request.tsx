import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, data, isRouteErrorResponse, redirect, useRouteError } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { AllocationMeter } from "~/components/open-request/allocation-meter";
import { StartNegotiationForm } from "~/components/open-request/start-negotiation-form";
import { OpenRequestViewBadge } from "~/components/open-request/view-badge";
import { presaleErrorMessage, toActionData, type PresaleActionData } from "~/components/presale/error-copy";
import { formatDay, formatQuantity, unitText } from "~/components/presale/format";
import { RequestStatusBadge } from "~/components/presale/status-badges";
import { producerPresales } from "~/producer/presales";
import type { Route } from "./+types/producer.open-request";

export const meta = () => [{ title: "Solicitud abierta · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await producerPresales.getOpenRequestForProducer(params.openRequestId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<PresaleActionData | Response> {
  const form = await request.formData();
  if (form.get("intent") !== "start") return { fieldErrors: { _form: ["Acción desconocida."] } };
  const result = await producerPresales.startOpenRequestNegotiation(params.openRequestId, {
    listingId: text(form, "listingId"),
    unitPrice: text(form, "unitPrice"),
    quantity: text(form, "quantity"),
    validUntil: text(form, "validUntil"),
    deliveryDate: text(form, "deliveryDate"),
    deliveryTerms: text(form, "deliveryTerms"),
  });
  return result.ok ? redirect(`/producer/negotiations/${result.value.id}`) : toActionData(result.error);
}

export default function ProducerOpenRequest({ loaderData, actionData }: Route.ComponentProps) {
  const { openRequest, view, remaining, canStart, own, options } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/producer/open-requests" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a solicitudes abiertas
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {openRequest.productionType} · {openRequest.buyerName}
          </p>
          <h1 className="break-words text-3xl text-primary">{openRequest.title}</h1>
        </div>
        <OpenRequestViewBadge view={view} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <Card className="gap-3 py-4">
            <CardContent className="px-4">
              <AllocationMeter openRequest={openRequest} remaining={remaining} />
            </CardContent>
          </Card>
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-primary">Lo que necesita el comprador</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Cantidad</dt>
                  <dd className="font-semibold tabular-nums">{formatQuantity(openRequest.quantity, openRequest)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pendiente por asignar</dt>
                  <dd className="font-semibold tabular-nums">{formatQuantity(remaining, openRequest)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Precio objetivo</dt>
                  <dd className="font-semibold tabular-nums">
                    {openRequest.targetUnitPrice === null
                      ? "Sin definir"
                      : `${formatMoney(openRequest.targetUnitPrice, openRequest.currency)} / ${unitText(openRequest, 1)}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Entrega</dt>
                  <dd className="font-semibold">{formatDay(openRequest.deliveryDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Lugar</dt>
                  <dd className="font-semibold">{openRequest.deliveryLocation}</dd>
                </div>
              </dl>
              {openRequest.notes && <p className="text-pretty text-sm text-muted-foreground">{openRequest.notes}</p>}
            </CardContent>
          </Card>

          {own ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg text-primary">Ya tienes una negociación en curso</CardTitle>
                  <RequestStatusBadge status={own.request.status} />
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="compact">
                  <Link to={`/producer/negotiations/${own.request.id}`}>
                    Ver negociación
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : canStart ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-primary">Hacer una oferta</CardTitle>
              </CardHeader>
              <CardContent>
                <StartNegotiationForm options={options} unit={openRequest} remaining={remaining} actionData={actionData} />
              </CardContent>
            </Card>
          ) : (
            <p className="rounded-lg border bg-card p-4 text-muted-foreground">
              Sin disponibilidad: esta solicitud ya no admite nuevas negociaciones.
            </p>
          )}
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
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos esta solicitud abierta" : "No pudimos cargar la solicitud abierta"}</h1>
      <Link to="/producer/open-requests" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a solicitudes abiertas
      </Link>
    </>
  );
}
