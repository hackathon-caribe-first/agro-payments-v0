import { ArrowLeft, X } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import type { RequestDetail } from "@agro/shared/modules/presales/application/use-cases";
import {
  availableQuantity,
  canAct,
  canCounter,
  canWithdraw,
  isoToday,
  latestQuote,
  offerCap,
  remainingToAward,
} from "@agro/shared/modules/presales/domain/presale-rules";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { AllocationMeter } from "~/components/open-request/allocation-meter";
import { AvailabilityMeter } from "~/components/presale/availability-meter";
import type { PresaleActionData } from "~/components/presale/error-copy";
import { formatDay, formatQuantity } from "~/components/presale/format";
import { RequestStatusBadge } from "~/components/presale/status-badges";
import { DecisionBar } from "./decision-bar";
import { OfferForm } from "./offer-form";
import { originLabel } from "./origin";
import { TermsSummary } from "./terms-summary";
import { Timeline } from "./timeline";
import { TurnIndicator } from "./turn-indicator";

type Viewer = "BUYER" | "PRODUCER";

interface Props {
  viewer: Viewer;
  detail: RequestDetail;
  actionData?: PresaleActionData;
  back: { to: string; label: string };
  // Where the open request lives for this viewer (buyer board / producer catalog entry).
  openRequestTo?: string;
}

// One detail screen for both parties: terms, timeline and only the actions the viewer's turn allows.
export function NegotiationDetail({ viewer, detail, actionData, back, openRequestTo }: Props) {
  const { request, listing, openRequest, turn } = detail;
  const pending = useNavigation().state !== "idle";
  const today = isoToday();
  const latest = latestQuote(request);
  const counterpart = viewer === "BUYER" ? request.producerName : request.buyerName;
  const isOpenRequest = request.origin === "OPEN_REQUEST";

  const live = request.status === "QUOTED" || request.status === "NEGOTIATING";
  const decidableRevision = live && latest?.status === "SENT" && canAct(request, viewer, "accept", today) ? latest.revision : null;
  const mayCounter = canCounter(request, viewer, today);
  const mayWithdraw = canWithdraw(request, viewer, today);

  const available = listing ? availableQuantity(listing) : 0;
  const cap = offerCap({ available, remaining: openRequest ? remainingToAward(openRequest) : undefined });

  // The producer's first response to a project-interest request.
  const canRespond = viewer === "PRODUCER" && request.status === "REQUESTED" && turn === "PRODUCER" && !isOpenRequest;
  const respondCap = offerCap({ available, requested: request.quantity });
  const respondBlocked = canRespond && (listing?.status !== "OPEN" || available <= 0);

  const formError = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");
  const barShown = live || (request.status === "REQUESTED" && mayWithdraw && !canRespond);
  const showOwnError = formError && !barShown && !canRespond;

  return (
    <div className="flex flex-col gap-6">
      <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {originLabel(request.origin)} · {listing?.title ?? "Proyecto"}
          </p>
          <h1 className="break-words text-3xl text-primary">{counterpart || "Negociación"}</h1>
          <div className="mt-2">
            <TurnIndicator turn={turn} viewer={viewer} counterpart={counterpart} />
          </div>
        </div>
        <RequestStatusBadge status={request.status} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {openRequest ? (
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="break-words text-base text-primary">{openRequest.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4">
                <AllocationMeter openRequest={openRequest} remaining={remainingToAward(openRequest)} />
                {openRequestTo && (
                  <Button asChild variant="outline" size="compact" className="self-start">
                    <Link to={openRequestTo}>Ver solicitud abierta</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            listing && (
              <Card className="gap-3 py-4">
                <CardContent className="px-4">
                  <AvailabilityMeter listing={listing} />
                </CardContent>
              </Card>
            )
          )}
          <Timeline history={request.history} unit={listing} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-primary">{isOpenRequest ? "Solicitud abierta" : "Solicitud inicial"}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{isOpenRequest && openRequest ? "Cantidad solicitada" : "Cantidad"}</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatQuantity(isOpenRequest && openRequest ? openRequest.quantity : request.quantity, listing)}
                  </dd>
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
            <TermsSummary key={quote.revision} quote={quote} unit={listing} />
          ))}

          {canRespond &&
            (respondBlocked ? (
              <p className="rounded-lg border bg-card p-4 text-muted-foreground">
                El proyecto ya no recibe solicitudes o no tiene disponibilidad: ya no se pueden enviar ofertas.
              </p>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-primary">Responder con una oferta</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <OfferForm
                    intent="respond"
                    maxQuantity={respondCap.cap}
                    capHint={`Máximo ${respondCap.cap}.`}
                    submitLabel="Enviar oferta"
                    actionData={actionData}
                  />
                  <Form method="post">
                    <input type="hidden" name="intent" value="decline" />
                    <Button type="submit" variant="outline" size="compact" disabled={pending}>
                      <X aria-hidden="true" />
                      Rechazar solicitud
                    </Button>
                  </Form>
                </CardContent>
              </Card>
            ))}

          {barShown && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-primary">{turn === viewer ? "Tu respuesta" : "Acciones"}</CardTitle>
              </CardHeader>
              <CardContent>
                <DecisionBar
                  key={`${request.status}-${latest?.revision ?? 0}`}
                  decidableRevision={decidableRevision}
                  canCounter={mayCounter}
                  canWithdraw={mayWithdraw}
                  actionData={actionData}
                  counterForm={
                    <OfferForm
                      intent="counter"
                      maxQuantity={cap.cap}
                      capHint={`Máximo ${cap.cap}.`}
                      initial={latest ? { quantity: latest.quantity, unitPrice: latest.unitPrice } : undefined}
                      submitLabel="Enviar contraoferta"
                      actionData={actionData}
                    />
                  }
                />
                {turn !== viewer && turn !== null && (
                  <p className="mt-3 text-sm text-muted-foreground">Esperando respuesta de {counterpart || "la otra parte"}.</p>
                )}
              </CardContent>
            </Card>
          )}

          {showOwnError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
