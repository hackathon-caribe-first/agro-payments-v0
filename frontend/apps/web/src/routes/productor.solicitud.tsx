import { ArrowLeft } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { availableQuantity } from "@agro/shared/modules/presales/domain/presale-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { AvailabilityMeter } from "~/components/presale/availability-meter";
import { presaleErrorMessage, toActionData, type PresaleActionData } from "~/components/presale/error-copy";
import { formatDay, formatQuantity } from "~/components/presale/format";
import { QuoteSummary } from "~/components/presale/quote-summary";
import { RequestHistory } from "~/components/presale/request-history";
import { RequestStatusBadge } from "~/components/presale/status-badges";
import { DeclineForm } from "~/components/producer/presale/decline-form";
import { RespondQuoteForm } from "~/components/producer/presale/respond-quote-form";
import { producerPresales } from "~/producer/presales";
import type { Route } from "./+types/productor.solicitud";

export const meta = () => [{ title: "Solicitud de cotización · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await producerPresales.getRequestDetail(params.requestId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<PresaleActionData> {
  const form = await request.formData();

  if (form.get("intent") === "decline") {
    const result = await producerPresales.declineRequest(params.requestId);
    return result.ok ? { fieldErrors: {} } : toActionData(result.error);
  }

  if (form.get("intent") === "respond") {
    const result = await producerPresales.respondToRequest(params.requestId, {
      unitPrice: text(form, "unitPrice"),
      quantity: text(form, "quantity"),
      validUntil: text(form, "validUntil"),
      deliveryTerms: text(form, "deliveryTerms"),
    });
    return result.ok ? { fieldErrors: {} } : toActionData(result.error);
  }

  return { fieldErrors: { _form: ["Acción desconocida."] } };
}

export default function ProductorSolicitud({ loaderData, actionData }: Route.ComponentProps) {
  const { request, listing } = loaderData;
  const available = listing ? availableQuantity(listing) : 0;
  const canRespond = request.status === "REQUESTED" && listing?.status === "OPEN" && available > 0;
  const unit = listing;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={`/productor/proyectos/${request.projectId}/preventa`}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a la preventa
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{listing?.title ?? "Preventa"}</p>
          <h1 className="break-words text-3xl text-primary">{request.buyerName}</h1>
        </div>
        <RequestStatusBadge status={request.status} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {listing && (
            <Card className="gap-3 py-4">
              <CardContent className="px-4">
                <AvailabilityMeter listing={listing} />
              </CardContent>
            </Card>
          )}
          <RequestHistory history={request.history} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-primary">Solicitud</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Cantidad solicitada</dt>
                  <dd className="font-semibold tabular-nums">{formatQuantity(request.quantity, unit)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Entrega deseada</dt>
                  <dd className="font-semibold">{formatDay(request.desiredDeliveryDate)}</dd>
                </div>
              </dl>
              {request.notes && <p className="text-pretty text-sm text-muted-foreground">{request.notes}</p>}
            </CardContent>
          </Card>

          {request.quotes.map((quote) => (
            <QuoteSummary key={quote.revision} quote={quote} unit={unit} />
          ))}

          {canRespond && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-primary">Responder con una cotización de venta</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <RespondQuoteForm maxQuantity={Math.min(request.quantity, available)} actionData={actionData} />
                <DeclineForm />
              </CardContent>
            </Card>
          )}
          {request.status === "REQUESTED" && !canRespond && (
            <p className="rounded-lg border bg-card p-4 text-muted-foreground">
              La preventa está cerrada o sin disponibilidad: ya no se pueden enviar cotizaciones de venta.
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
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos esta solicitud" : "No pudimos cargar la solicitud"}</h1>
      <Link to="/productor/solicitudes" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a las solicitudes
      </Link>
    </>
  );
}
