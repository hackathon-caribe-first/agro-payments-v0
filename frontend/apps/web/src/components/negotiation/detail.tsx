import { ArrowLeft } from "lucide-react";
import { Link, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { RequestDetail } from "@agro/shared/modules/presales/application/use-cases";
import { autoClosedBy } from "@agro/shared/modules/presales/domain/negotiation-rules";
import {
  canAct,
  canCounter,
  canWithdraw,
  isoToday,
  latestQuote,
  quantityCap,
  remainingToAward,
} from "@agro/shared/modules/presales/domain/presale-rules";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { DepositConfirm } from "~/components/escrow/deposit-confirm";
import { DepositStatus } from "~/components/escrow/deposit-status";
import { AllocationMeter } from "~/components/open-request/allocation-meter";
import type { PresaleActionData } from "~/components/presale/error-copy";
import { formatDay, formatQuantity } from "~/components/presale/format";
import { RequestStatusBadge } from "~/components/presale/status-badges";
import { DecisionBar } from "./decision-bar";
import { OfferForm } from "./offer-form";
import { originLabel } from "./origin";
import { ScopedOfferForm } from "./scoped-offer-form";
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

// One detail screen for both parties and every kind of negotiation: terms, timeline and only the actions the viewer's turn allows.
export function NegotiationDetail({ viewer, detail, actionData, back, openRequestTo }: Props) {
  const { request, unit, openRequest, turn, project, milestone, quotationTotal } = detail;
  const pending = useNavigation().state !== "idle";
  const today = isoToday();
  const latest = latestQuote(request);
  const counterpart = viewer === "BUYER" ? request.producerName : request.buyerName;
  const isOpenRequest = request.origin === "OPEN_REQUEST";
  const scope = request.scope;
  const isProjectScope = scope === "PROJECT" || scope === "MILESTONE";
  const projectLink = viewer === "BUYER" ? `/buyer/projects/${request.projectId}` : `/producer/projects/${request.projectId}`;

  const live = request.status === "QUOTED" || request.status === "NEGOTIATING";
  const decidableRevision = live && latest?.status === "SENT" && canAct(request, viewer, "accept", today) ? latest.revision : null;
  const mayCounter = canCounter(request, viewer, today);
  const mayWithdraw = canWithdraw(request, viewer, today);
  const closedBy = autoClosedBy(request);

  // Open-request negotiations are capped by what is still to be awarded.
  const cap = quantityCap(openRequest ? remainingToAward(openRequest) : 0);

  const barShown = live || (request.status === "REQUESTED" && mayWithdraw);
  const showOwnError = (actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ") ?? "") && !barShown;
  const depositPending = scope === "PROJECT" && request.deposit?.status === "PENDING";

  // The header names what is being negotiated.
  const kicker = isProjectScope
    ? scope === "MILESTONE"
      ? `Hito ${milestone?.sequenceOrder ?? ""} · ${milestone?.title ?? "Hito"}`
      : "Negociación del proyecto"
    : `${originLabel(request.origin)} · ${openRequest?.title ?? "Proyecto"}`;

  const counterForm = (() => {
    if (latest?.terms.kind === "PROJECT") {
      const t = latest.terms;
      return (
        <ScopedOfferForm
          scope="PROJECT"
          intent="counter"
          initial={{ quantity: t.quantity, unit: t.unit === "UNKNOWN" ? undefined : t.unit, unitPrice: t.unitPrice, deliveryDate: t.deliveryDate, notes: t.notes }}
          submitLabel="Enviar contraoferta"
          actionData={actionData}
        />
      );
    }
    if (latest?.terms.kind === "MILESTONE") {
      const t = latest.terms;
      return (
        <ScopedOfferForm
          scope="MILESTONE"
          intent="counter"
          initial={{ price: t.price, deliveryDate: t.deliveryDate, notes: t.notes }}
          reference={milestone ? milestone.suppliesBudget + milestone.laborBudget : t.price}
          submitLabel="Enviar contraoferta"
          actionData={actionData}
        />
      );
    }
    return (
      <OfferForm
        intent="counter"
        maxQuantity={cap.cap}
        capHint={`Máximo ${cap.cap}.`}
        initial={latest ? { quantity: latest.quantity, unitPrice: latest.unitPrice } : undefined}
        submitLabel="Enviar contraoferta"
        actionData={actionData}
      />
    );
  })();

  return (
    <div className="flex flex-col gap-6">
      <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{kicker}</p>
          <h1 className="break-words text-3xl text-primary">{counterpart || "Negociación"}</h1>
          <div className="mt-2">
            <TurnIndicator turn={turn} viewer={viewer} counterpart={counterpart} />
          </div>
        </div>
        <RequestStatusBadge status={request.status} autoClosedBy={closedBy} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {isProjectScope ? (
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="break-words text-base text-primary">{project?.title ?? detail.projectTitle}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4">
                {scope === "PROJECT" && quotationTotal !== null && (
                  <p aria-live="polite" className="text-sm text-muted-foreground">
                    Total de la cotización del proyecto:{" "}
                    <span className="font-semibold tabular-nums text-foreground">{formatMoney(quotationTotal, project?.currency ?? "COP")}</span>
                  </p>
                )}
                <Button asChild variant="outline" size="compact" className="self-start">
                  <Link to={projectLink}>Ver proyecto</Link>
                </Button>
              </CardContent>
            </Card>
          ) : openRequest ? (
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
          ) : null}
          {scope === "PROJECT" && request.deposit && <DepositStatus deposit={request.deposit} currency={project?.currency} />}
          <Timeline history={request.history} unit={unit} scope={scope} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {!isProjectScope && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-primary">{isOpenRequest ? "Solicitud abierta" : "Solicitud inicial"}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{isOpenRequest && openRequest ? "Cantidad solicitada" : "Cantidad"}</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatQuantity(isOpenRequest && openRequest ? openRequest.quantity : request.quantity, unit)}
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
          )}

          {request.quotes.map((quote) => (
            <TermsSummary key={quote.revision} quote={quote} unit={unit} />
          ))}

          {depositPending && viewer === "BUYER" && request.deposit && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-primary">Depósito pendiente</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-pretty text-sm text-muted-foreground">
                  El acuerdo está cerrado. Deposita el total de la cotización del proyecto en la fiducia.
                </p>
                <DepositConfirm total={request.deposit.agreedTotal} currency={project?.currency} actionData={actionData} />
              </CardContent>
            </Card>
          )}
          {depositPending && viewer === "PRODUCER" && (
            <p role="status" className="rounded-lg border bg-card p-4 text-muted-foreground">
              Acuerdo cerrado. Esperando que el comprador deposite en la fiducia.
            </p>
          )}

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
                  acceptConfirm={
                    scope === "PROJECT" && quotationTotal !== null
                      ? { total: quotationTotal, deposit: viewer === "BUYER", currency: project?.currency }
                      : undefined
                  }
                  counterForm={counterForm}
                />
                {turn !== viewer && turn !== null && (
                  <p className="mt-3 text-sm text-muted-foreground">Esperando respuesta de {counterpart || "la otra parte"}.</p>
                )}
              </CardContent>
            </Card>
          )}

          {showOwnError && !depositPending && (
            <Alert variant="destructive">
              <AlertDescription>{actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ")}</AlertDescription>
            </Alert>
          )}
          {pending && <span className="sr-only">Procesando…</span>}
        </div>
      </div>
    </div>
  );
}
