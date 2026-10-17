import { ArrowRight, Lock } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { OpenRequestBoard, RequestEntry } from "@agro/shared/modules/presales/application/use-cases";
import { latestQuote } from "@agro/shared/modules/presales/domain/presale-rules";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@agro/shared/ui/alert-dialog";
import { Badge } from "@agro/shared/ui/badge";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { turnLabel } from "~/components/negotiation/turn-indicator";
import type { PresaleActionData } from "~/components/presale/error-copy";
import { formatDay, formatQuantity, unitText } from "~/components/presale/format";
import { RequestStatusBadge } from "~/components/presale/status-badges";
import { AllocationMeter } from "./allocation-meter";
import { OpenRequestViewBadge } from "./view-badge";

function NegotiationRow({ entry, unit }: { entry: RequestEntry; unit: { unit: OpenRequestBoard["openRequest"]["unit"]; rawUnit: string } }) {
  const { request, turn } = entry;
  const latest = latestQuote(request);
  const turnText = turnLabel(turn, "BUYER");
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3">
      <div className="min-w-0">
        <p className="break-words font-semibold">{request.producerName || "Productor"}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {latest
            ? `${formatQuantity(latest.quantity, unit)} a ${formatMoney(latest.unitPrice, latest.currency)} · Total ${formatMoney(latest.total, latest.currency)}`
            : "Sin oferta todavía"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RequestStatusBadge status={request.status} />
        {turnText && <Badge variant={turn === "BUYER" ? "default" : "secondary"}>{turnText}</Badge>}
        <Button asChild variant="outline" size="compact">
          <Link to={`/buyer/negotiations/${request.id}`}>
            Ver
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </li>
  );
}

// The buyer's view of one open request: terms, how much is agreed, and every producer's negotiation.
export function OpenRequestBoardView({ board, actionData }: { board: OpenRequestBoard; actionData?: PresaleActionData }) {
  const { openRequest, view, remaining, negotiations } = board;
  const pending = useNavigation().state !== "idle";
  const error = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");
  const canClose = openRequest.status === "OPEN";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base text-primary">Estado</CardTitle>
              <OpenRequestViewBadge view={view} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-4">
            <AllocationMeter openRequest={openRequest} remaining={remaining} />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {canClose ? (
              <>
                <Form method="post" id="close-open-request-form">
                  <input type="hidden" name="intent" value="close" />
                </Form>
                {/* Closing blocks new negotiations but cannot be undone, so it asks first. */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="compact" disabled={pending} className="self-start">
                      <Lock aria-hidden="true" />
                      Cerrar solicitud
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Cerrar esta solicitud abierta?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Los productores ya no podrán iniciar nuevas negociaciones. Las negociaciones en curso podrán seguir. Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
                      <AlertDialogAction size="compact" type="submit" form="close-open-request-form">
                        Cerrar solicitud
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Esta solicitud ya no recibe nuevas negociaciones.</p>
            )}
          </CardContent>
        </Card>
      </aside>

      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-primary">Lo que necesitas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Producción</dt>
                <dd className="font-semibold">{openRequest.productionType}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cantidad</dt>
                <dd className="font-semibold tabular-nums">{formatQuantity(openRequest.quantity, openRequest)}</dd>
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

        <section aria-labelledby="open-negotiations-heading" className="flex flex-col gap-3">
          <h2 id="open-negotiations-heading" className="text-lg text-primary">
            Negociaciones
          </h2>
          {negotiations.length === 0 ? (
            <p className="rounded-lg border bg-card p-4 text-muted-foreground">Aún ningún productor ha iniciado una negociación.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {negotiations.map((entry) => (
                <NegotiationRow key={entry.request.id} entry={entry} unit={openRequest} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
