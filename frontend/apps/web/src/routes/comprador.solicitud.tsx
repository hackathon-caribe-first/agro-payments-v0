import { ArrowLeft, Ban } from "lucide-react";
import { Form, Link, data, isRouteErrorResponse, useNavigation, useRouteError } from "react-router";
import { latestQuote } from "@agro/shared/modules/presales/domain/presale-rules";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { QuoteDecision } from "~/components/buyer/quote-decision";
import { presaleErrorMessage, toActionData, type PresaleActionData } from "~/components/presale/error-copy";
import { formatDay, formatQuantity } from "~/components/presale/format";
import { QuoteSummary } from "~/components/presale/quote-summary";
import { RequestHistory } from "~/components/presale/request-history";
import { RequestStatusBadge } from "~/components/presale/status-badges";
import { buyer } from "~/buyer/module";
import type { Route } from "./+types/comprador.solicitud";

export const meta = () => [{ title: "Solicitud de cotización · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await buyer.getRequestDetail(params.requestId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<PresaleActionData> {
  const form = await request.formData();
  const intent = form.get("intent");

  const result =
    intent === "accept"
      ? await buyer.acceptSaleQuote(params.requestId, form.get("revision"))
      : intent === "reject"
        ? await buyer.rejectSaleQuote(params.requestId, form.get("revision"))
        : intent === "cancel"
          ? await buyer.cancelRequest(params.requestId)
          : null;

  if (!result) return { fieldErrors: { _form: ["Acción desconocida."] } };
  return result.ok ? { fieldErrors: {} } : toActionData(result.error);
}

export default function CompradorSolicitud({ loaderData, actionData }: Route.ComponentProps) {
  const { request, listing } = loaderData;
  const unit = listing;
  const latest = latestQuote(request);
  const pending = useNavigation().state !== "idle";
  const canDecide = request.status === "QUOTED" && latest?.status === "SENT";

  return (
    <div className="flex flex-col gap-6">
      <Link to="/comprador/solicitudes" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a mis solicitudes
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Solicitud de cotización</p>
          <h1 className="break-words text-3xl text-primary">{listing?.title ?? "Preventa"}</h1>
        </div>
        <RequestStatusBadge status={request.status} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="min-w-0 lg:col-start-2 lg:row-start-1">
          <RequestHistory history={request.history} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-primary">Tu solicitud</CardTitle>
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
              {request.status === "REQUESTED" && (
                <Form method="post">
                  <input type="hidden" name="intent" value="cancel" />
                  <Button type="submit" variant="outline" size="compact" disabled={pending}>
                    <Ban aria-hidden="true" />
                    Cancelar solicitud
                  </Button>
                </Form>
              )}
            </CardContent>
          </Card>

          {request.quotes.map((quote) => (
            <QuoteSummary key={quote.revision} quote={quote} unit={unit} />
          ))}

          {canDecide && latest && <QuoteDecision revision={latest.revision} actionData={actionData} />}
          {!canDecide && actionData?.fieldErrors._form?.length ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              ✕ {actionData.fieldErrors._form.join(" ")}
            </p>
          ) : null}
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
      <Link to="/comprador/solicitudes" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis solicitudes
      </Link>
    </>
  );
}
