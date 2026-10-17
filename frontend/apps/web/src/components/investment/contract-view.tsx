import { ArrowLeft, FileSignature, Fingerprint, KeyRound } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import type { ContractDetail } from "@agro/shared/modules/investment-proposals/application/use-cases";
import { buildContractClauses, liquidationSteps } from "@agro/shared/modules/investment-proposals/domain/contract-rules";
import type { Party, Signature } from "@agro/shared/modules/investment-proposals/domain/investment";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
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
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDateTime, formatDay } from "~/components/presale/format";
import type { InvestmentActionData } from "./error-copy";
import { ContractStatusBadge } from "./status-badges";

interface Props {
  viewer: Party;
  detail: ContractDetail;
  actionData?: InvestmentActionData;
  back: { to: string; label: string };
}

function SignatureRow({ role, name, signature }: { role: string; name: string; signature: Signature | null }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-md border bg-card p-3 text-sm">
      <span className="text-muted-foreground">{role}</span>
      <span className="font-semibold">{name}</span>
      {signature ? (
        <span className="font-semibold text-primary">✓ Firmado el {formatDateTime(signature.signedAt)}</span>
      ) : (
        <span className="text-muted-foreground">◷ Pendiente de firma</span>
      )}
    </li>
  );
}

// The contract generated from the template, with both signatures and the document hash. The viewer signs from here.
export function ContractView({ viewer, detail, actionData, back }: Props) {
  const { contract, signBlock } = detail;
  const pending = useNavigation().state !== "idle";
  const area = viewer === "INVESTOR" ? "investor" : "producer";
  const clauses = buildContractClauses(contract, formatMoney, formatDay);
  const steps = liquidationSteps(contract, formatMoney);
  const error = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");
  const canSign = signBlock === null;

  return (
    <div className="flex flex-col gap-6">
      <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Contrato de inversión · {contract.projectCode}</p>
          <h1 className="break-words text-3xl text-primary">{contract.projectTitle}</h1>
          <p className="mt-2 text-muted-foreground">
            {contract.investorName} y {contract.producerName}
          </p>
        </div>
        <ContractStatusBadge status={contract.status} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base text-primary">Firmas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4">
              <ul className="flex flex-col gap-2" aria-live="polite">
                <SignatureRow role="Inversor" name={contract.investorName} signature={contract.investorSignature} />
                <SignatureRow role="Productor" name={contract.producerName} signature={contract.producerSignature} />
              </ul>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {canSign ? (
                <>
                  <Form method="post" id="sign-contract-form">
                    <input type="hidden" name="intent" value="sign" />
                  </Form>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" size="compact" disabled={pending} className="self-start">
                        <FileSignature aria-hidden="true" />
                        Firmar contrato
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Firmar el contrato?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {`Al firmar aceptas los hitos, sus topes y la regla de liquidación del documento con huella ${contract.documentHash.slice(0, 12)}…. La firma queda registrada con fecha y hora y no se puede deshacer.`}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
                        <AlertDialogAction size="compact" type="submit" form="sign-contract-form">
                          Firmar contrato
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  {signBlock === "already_signed"
                    ? contract.status === "SIGNED"
                      ? "Contrato firmado por ambas partes."
                      : "Ya firmaste. Falta la firma de la otra parte."
                    : signBlock === "not_pending"
                      ? "Contrato firmado por ambas partes."
                      : "Solo las partes del contrato pueden firmarlo."}
                </p>
              )}
              {contract.status === "SIGNED" && viewer === "INVESTOR" && (
                <Button asChild size="compact" className="self-start">
                  <Link to={`/investor/projects/${contract.projectId}/grants`}>
                    <KeyRound aria-hidden="true" />
                    Solicitar grant del hito 1
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-1.5 text-base text-primary">
                <Fingerprint aria-hidden="true" className="size-4" />
                Huella del documento
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-4">
              <p className="text-sm text-muted-foreground">SHA-256 del contrato generado desde la plantilla.</p>
              <code className="break-all rounded-md border bg-muted p-2 text-xs">{contract.documentHash}</code>
            </CardContent>
          </Card>

          <Button asChild variant="outline" size="compact" className="self-start">
            <Link to={`/${area}/proposals/${contract.proposalId}`}>Ver propuesta acordada</Link>
          </Button>
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-primary">Condiciones acordadas</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Monto</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(contract.amount, contract.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Total de la cotización</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(contract.projectTotal, contract.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Hitos</dt>
                  <dd className="font-semibold tabular-nums">{contract.milestones.length}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <section aria-labelledby="contract-milestones-heading" className="flex flex-col gap-3">
            <h2 id="contract-milestones-heading" className="text-lg text-primary">
              Hitos y topes
            </h2>
            <ol className="flex flex-col gap-2">
              {contract.milestones.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border bg-card p-3 text-sm">
                  <span className="min-w-0 break-words font-semibold">
                    Hito {m.sequenceOrder} · {m.title}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    Tope <span className="font-semibold text-foreground">{formatMoney(m.cap, contract.currency)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="contract-liquidation-heading" className="flex flex-col gap-3">
            <h2 id="contract-liquidation-heading" className="text-lg text-primary">
              Regla de liquidación
            </h2>
            <ol className="flex flex-col gap-2">
              {steps.map((s) => (
                <li key={s.order} className="rounded-md border bg-card p-3 text-sm">
                  <p className="font-semibold">
                    {s.order}. {s.label}
                  </p>
                  <p className="text-muted-foreground">{s.detail}</p>
                </li>
              ))}
            </ol>
            <p className="text-pretty text-sm text-muted-foreground">
              Si el valor de la venta no alcanza, el inversor asume la pérdida: los pagos se detienen cuando se agota el valor de la venta.
            </p>
          </section>

          <section aria-labelledby="contract-document-heading" className="flex flex-col gap-3">
            <h2 id="contract-document-heading" className="text-lg text-primary">
              Documento
            </h2>
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              {clauses.map((clause) => (
                <div key={clause.title}>
                  <h3 className="text-sm font-semibold">{clause.title}</h3>
                  <p className="text-pretty text-sm text-muted-foreground">{clause.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
