import { ArrowLeft, FileSignature } from "lucide-react";
import { Link, useNavigation } from "react-router";
import type { ProposalDetail as ProposalDetailModel } from "@agro/shared/modules/investment-proposals/application/use-cases";
import type { Party } from "@agro/shared/modules/investment-proposals/domain/investment";
import { canAct, canCounter, canWithdraw, isoToday, latestRevision } from "@agro/shared/modules/investment-proposals/domain/proposal-rules";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { DecisionBar } from "./decision-bar";
import type { InvestmentActionData } from "./error-copy";
import { ProposalForm } from "./proposal-form";
import { RevisionCard } from "./revision-card";
import { ContractStatusBadge, ProposalStatusBadge } from "./status-badges";
import { Timeline } from "./timeline";
import { TurnIndicator } from "./turn-indicator";

interface Props {
  viewer: Party;
  detail: ProposalDetailModel;
  actionData?: InvestmentActionData;
  back: { to: string; label: string };
}

// One detail screen for both parties: terms of every round, timeline and only the actions the viewer's turn allows.
export function ProposalDetail({ viewer, detail, actionData, back }: Props) {
  const { proposal, turn, catalog, contract } = detail;
  const pending = useNavigation().state !== "idle";
  const today = isoToday();
  const latest = latestRevision(proposal);
  const counterpart = viewer === "INVESTOR" ? proposal.producerName : proposal.investorName;
  const area = viewer === "INVESTOR" ? "investor" : "producer";
  const projectLink = `/${area}/projects/${proposal.projectId}`;

  const live = proposal.status === "PROPOSED" || proposal.status === "NEGOTIATING";
  const decidableRevision = live && latest?.status === "SENT" && canAct(proposal, viewer, "accept", today) ? latest.revision : null;
  const mayCounter = canCounter(proposal, viewer, today);
  const mayWithdraw = canWithdraw(proposal, viewer, today);
  const barShown = live && (decidableRevision !== null || mayCounter || mayWithdraw);
  const formError = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");

  const viewerSigned = contract ? (viewer === "INVESTOR" ? contract.investorSignature : contract.producerSignature) !== null : false;

  return (
    <div className="flex flex-col gap-6">
      <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Propuesta de inversión · {proposal.projectTitle}</p>
          <h1 className="break-words text-3xl text-primary">{counterpart || "Propuesta"}</h1>
          <div className="mt-2">
            <TurnIndicator turn={turn} viewer={viewer} counterpart={counterpart} />
          </div>
        </div>
        <ProposalStatusBadge status={proposal.status} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="break-words text-base text-primary">{catalog?.project.title ?? proposal.projectTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4">
              <p className="text-sm text-muted-foreground">
                Total de la cotización del proyecto:{" "}
                <span className="font-semibold tabular-nums text-foreground">{formatMoney(catalog?.quotationTotal ?? proposal.projectTotal, proposal.currency)}</span>
              </p>
              <Button asChild variant="outline" size="compact" className="self-start">
                <Link to={projectLink}>Ver proyecto</Link>
              </Button>
            </CardContent>
          </Card>
          {contract && (
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-base text-primary">Contrato</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4">
                <ContractStatusBadge status={contract.status} />
                <Button asChild size="compact" variant={viewerSigned || contract.status === "SIGNED" ? "outline" : "default"} className="self-start">
                  <Link to={`/${area}/contracts/${contract.id}`}>
                    <FileSignature aria-hidden="true" />
                    {contract.status === "SIGNED" ? "Ver contrato" : viewerSigned ? "Ver contrato" : "Revisar y firmar"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
          <Timeline history={proposal.history} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {proposal.revisions.map((revision) => (
            <RevisionCard key={revision.revision} revision={revision} />
          ))}

          {proposal.status === "ACCEPTED" && (
            <p role="status" className="rounded-lg border bg-card p-4 text-muted-foreground">
              {contract
                ? contract.status === "SIGNED"
                  ? "Acuerdo cerrado y contrato firmado por ambas partes."
                  : "Acuerdo cerrado. El contrato está pendiente de firmas de ambas partes."
                : "Acuerdo cerrado."}
            </p>
          )}

          {barShown && latest && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-primary">{turn === viewer ? "Tu respuesta" : "Acciones"}</CardTitle>
              </CardHeader>
              <CardContent>
                <DecisionBar
                  key={`${proposal.status}-${latest.revision}`}
                  decidableRevision={decidableRevision}
                  canCounter={mayCounter}
                  canWithdraw={mayWithdraw}
                  actionData={actionData}
                  accept={{ amount: latest.amount, yieldBps: latest.yieldBps, currency: latest.currency }}
                  counterForm={
                    <ProposalForm
                      intent="counter"
                      maxAmount={proposal.projectTotal}
                      currency={proposal.currency}
                      initial={{ amount: latest.amount, yieldBps: latest.yieldBps, validUntil: latest.validUntil }}
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

          {formError && !barShown && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          {pending && <span className="sr-only">Procesando…</span>}
        </div>
      </div>
    </div>
  );
}
