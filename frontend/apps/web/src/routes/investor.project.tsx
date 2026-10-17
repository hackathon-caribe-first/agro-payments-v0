import { ArrowLeft, ChartLine, HandCoins } from "lucide-react";
import { Form, Link, data, redirectDocument, useNavigation, useSearchParams } from "react-router";
import type { Investment, InvestmentStatus } from "@agro/shared/modules/investments/domain/investment";
import { rateText } from "@agro/shared/modules/investments/domain/investment";
import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Input } from "@agro/shared/ui/input";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { CaptureBar, SimulationNotice } from "~/components/investor/capture-bar";
import { Field, keepDigits } from "~/components/presale/field";
import { formatDateTime } from "~/components/presale/format";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { investor } from "~/investor/module";
import type { Route } from "./+types/investor.project";

export const meta = () => [{ title: "Invertir · Surco" }];

const FUNDABLE = ["DRAFT", "CONTRACT_SIGNED", "FUNDING_IN_PROGRESS"];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await investor.getProjectPage(params.projectId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response("No pudimos cargar el proyecto.", { status: 502 });
  }
  return result.value;
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<{ fieldErrors: FieldErrors } | Response> {
  const form = await request.formData();
  const result = await investor.invest(params.projectId, { amount: form.get("amount") ?? "", walletAddress: form.get("walletAddress") ?? "" });
  if (!result.ok) {
    if (result.error.kind === "validation") return { fieldErrors: result.error.fieldErrors };
    return { fieldErrors: { [FORM_LEVEL_KEY]: ["No pudimos registrar la inversión. Revisa tu conexión e intenta de nuevo."] } };
  }
  // Open Payments: the investor approves the debit in their wallet. redirectDocument + absolute URL: a full page load, never a
  // client-side navigation. Simulated: captured already, the page reloads with ?capture=ok.
  if (result.value.consentRedirectUrl) return redirectDocument(result.value.consentRedirectUrl);
  return redirectDocument(`/investor/projects/${params.projectId}?capture=ok`);
}

const STATUS: Record<InvestmentStatus, { label: string; tone: Tone; symbol: string }> = {
  PENDING_CONSENT: { label: "Esperando tu aprobación", tone: "warning", symbol: "◷" },
  CAPTURED: { label: "En custodia", tone: "success", symbol: "✓" },
  FAILED: { label: "No se completó", tone: "danger", symbol: "✕" },
  UNKNOWN: { label: "Estado desconocido", tone: "neutral", symbol: "○" },
};

// The wallet sends the investor back here with ?capture=ok or ?capture=error.
function CaptureResult() {
  const [params] = useSearchParams();
  const result = params.get("capture");
  if (result === "ok") {
    return (
      <p role="status" className="rounded-md bg-secondary px-4 py-3 font-semibold text-primary">
        ✓ Tu aporte quedó registrado en la custodia del proyecto.
      </p>
    );
  }
  if (result === "error") {
    return (
      <p role="alert" className="rounded-md border border-destructive bg-card px-4 py-3 font-semibold text-destructive">
        ✕ No se completó la inversión: no aprobaste el permiso en tu billetera, la cotización cambió o el pago falló. Puedes intentarlo de nuevo.
      </p>
    );
  }
  return null;
}

function Receipt({ investment }: { investment: Investment }) {
  const { quote } = investment;
  const rate = investment.impliedRate ? rateText(investment.impliedRate) : null;
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold tabular-nums">{formatMoney(investment.amount, investment.currency)}</span>
        <StatusBadge {...STATUS[investment.status]} />
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-2">
        {quote && (
          <div>
            <dt className="text-muted-foreground">Debitado de tu billetera</dt>
            <dd className="tabular-nums">{formatMoney(Number(quote.debitAmount), quote.debitAssetCode, quote.debitAssetScale)}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Recibido en custodia</dt>
          <dd className="tabular-nums">{formatMoney(quote?.receiveAmount ?? investment.amount, investment.currency)}</dd>
        </div>
        {rate && quote && (
          <div>
            <dt className="text-muted-foreground">Tasa implícita (TRM de entrada)</dt>
            <dd className="tabular-nums">
              {rate} {investment.currency}/{quote.debitAssetCode}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">{investment.capturedAt ? "Captado" : "Creado"}</dt>
          <dd className="tabular-nums">{formatDateTime(investment.capturedAt ?? investment.createdAt)}</dd>
        </div>
      </dl>
      {investment.failureReason && <p className="text-destructive">✕ {investment.failureReason}</p>}
      <p className="break-all text-muted-foreground">Billetera: {investment.walletAddress}</p>
    </li>
  );
}

function InvestForm({ actionData }: { actionData?: { fieldErrors: FieldErrors } }) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";
  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <Field id="invest-amount" label="Monto a invertir (COP)" hint="Lo que recibe la custodia, en pesos. Tu billetera debita el equivalente en su moneda." errors={errors.amount}>
        {(aria) => <Input id="invest-amount" name="amount" inputMode="numeric" autoComplete="off" onInput={keepDigits} onChange={() => clear("amount")} {...aria} />}
      </Field>
      <Field id="invest-wallet" label="Dirección de tu billetera" hint="Por ejemplo https://ilp.interledger-test.dev/tu-billetera" errors={errors.wallet_address}>
        {(aria) => <Input id="invest-wallet" name="walletAddress" type="url" autoComplete="off" onChange={() => clear("wallet_address")} {...aria} />}
      </Field>
      {errors[FORM_LEVEL_KEY]?.length ? (
        <Alert variant="destructive">
          <AlertDescription>{errors[FORM_LEVEL_KEY].join(" ")}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        <HandCoins aria-hidden="true" />
        {pending ? "Preparando…" : "Invertir"}
      </Button>
    </Form>
  );
}

export default function InvestorProject({ loaderData, actionData }: Route.ComponentProps) {
  const { project, capture, investments } = loaderData;
  const open = FUNDABLE.includes(project.currentStatus);
  return (
    <div className="flex flex-col gap-6">
      <Link to="/investor" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a proyectos en captación
      </Link>
      <CaptureResult />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{project.projectCode}</p>
          <h1 className="break-words text-3xl text-primary">{project.title}</h1>
          <p className="mt-2 text-pretty text-muted-foreground">{project.description}</p>
          <SimulationNotice />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectStatusBadge status={project.currentStatus} />
          <Button asChild variant="outline" size="compact">
            <Link to={`/investor/projects/${project.id}/panel`}>
              <ChartLine aria-hidden="true" />
              Ver mi panel
            </Link>
          </Button>
        </div>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-primary">Captación</CardTitle>
        </CardHeader>
        <CardContent>
          <CaptureBar capture={capture} detailed />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-primary">Invertir</CardTitle>
        </CardHeader>
        <CardContent>
          {open ? (
            <InvestForm actionData={actionData} />
          ) : (
            <p className="text-muted-foreground">Este proyecto ya no recibe inversiones.</p>
          )}
        </CardContent>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl text-primary">Tus inversiones</h2>
        {investments.length === 0 ? (
          <p className="text-muted-foreground">Aún no has invertido en este proyecto.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {investments.map((i) => (
              <Receipt key={i.id} investment={i} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
