import { isRouteErrorResponse, useRouteError } from "react-router";
import { useState } from "react";
import { STEP_LABEL, groupByStep, parseStep } from "@agro/shared/modules/trace/domain/trace";
import type { OpsError } from "@agro/shared/modules/panel/domain/errors";
import type { PaymentStepsView } from "@agro/shared/modules/trace/domain/payment-steps";
import { useLiveRevalidate } from "~/components/panel/live-status";
import { PaymentReceipt } from "~/components/payments/payment-receipt";
import { PaymentStepsFilters } from "~/components/trace/payment-timeline";
import { RevealToggle } from "~/components/trace/reveal-toggle";
import { TraceEntryCard } from "~/components/trace/trace-entry";
import { TraceFilters } from "~/components/trace/trace-filters";
import { opsErrorMessage, unwrapOps } from "~/panel/error-copy";
import { IS_HTTP } from "~/platform/transport";
import { trace } from "~/trace/module";
import type { Route } from "./+types/ops.trace";

export const meta = () => [{ title: "Traza de pagos · Surco" }];

// A 401/403 reads as a permission problem, not as a broken connection.
const stepsErrorMessage = (error: OpsError): string =>
  error.kind === "network" && error.status === 401
    ? "Inicia sesión para ver la traza de pagos."
    : error.kind === "network" && error.status === 403
      ? "Tu rol no puede ver la traza de pagos. Solo operación y fiduciaria tienen acceso."
      : opsErrorMessage(error);

const EMPTY_STEPS: PaymentStepsView = { payments: [], total: 0, projects: [], projectLabels: {}, kinds: [] };

// ponytail: live by polling the loader every 2 s (paused while the tab is hidden); SSE push if 2 s lag or load ever matters.
const STEPS_REFRESH_MS = 2000;

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const params = new URL(request.url).searchParams;
  if (IS_HTTP) {
    // Http mode: the real payment-steps log. Errors stay inline instead of throwing to the ErrorBoundary.
    const filter = { projectId: params.get("project") || undefined, kind: params.get("kind") || undefined };
    const result = await trace.loadPaymentSteps(filter);
    return {
      mode: "steps" as const,
      filter,
      view: result.ok ? result.value : EMPTY_STEPS,
      error: result.ok ? null : stepsErrorMessage(result.error),
    };
  }
  const filter = {
    projectId: params.get("project") || undefined,
    milestoneId: params.get("milestone") || undefined,
    step: parseStep(params.get("step")),
  };
  return { mode: "curl" as const, filter, view: unwrapOps(await trace.loadTrace(filter)) };
}

export default function Trace({ loaderData }: Route.ComponentProps) {
  return loaderData.mode === "steps" ? <PaymentStepsTrace {...loaderData} /> : <CurlTrace {...loaderData} />;
}

function PaymentStepsTrace({ filter, view, error }: Extract<Route.ComponentProps["loaderData"], { mode: "steps" }>) {
  useLiveRevalidate(STEPS_REFRESH_MS);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl text-primary">Traza de pagos</h1>
        <p className="max-w-prose text-pretty text-muted-foreground">
          Cada pago como un recibo: en qué paso de Open Payments va, cuánto tardó cada paso y el comprobante para buscarlo en la
          billetera.
        </p>
      </header>

      <PaymentStepsFilters view={view} filter={filter} />

      {error ? (
        <p role="alert" className="rounded-md border border-destructive bg-card px-4 py-3 font-semibold text-destructive">
          ✕ {error}
        </p>
      ) : (
        <section aria-labelledby="steps-payments" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="steps-payments" className="text-xl text-primary">
              Pagos, el más nuevo arriba
            </h2>
            <p aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
              {view.payments.length} de {view.total} pagos
            </p>
          </div>
          {view.payments.length === 0 ? (
            <p className="rounded-lg border bg-card p-5 text-muted-foreground">
              {view.total === 0 ? "Aún no hay pagos registrados en Open Payments." : "No hay pagos para este filtro."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {view.payments.map((p) => (
                <PaymentReceipt key={`${p.kind}:${p.paymentId}`} payment={p} projectLabel={p.projectId ? view.projectLabels[p.projectId] : undefined} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function CurlTrace({ filter, view }: Extract<Route.ComponentProps["loaderData"], { mode: "curl" }>) {
  const [revealTokens, setRevealTokens] = useState(false);
  const groups = groupByStep(view.entries);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl text-primary">Traza de pagos</h1>
        <p className="max-w-prose text-pretty text-muted-foreground">
          Las peticiones a Open Payments detrás de cada grant, línea de pago y liquidación, como comandos curl listos para soporte. Los tokens se muestran recortados
          (<code>abcd…wxyz</code>) salvo que lo pidas.
        </p>
      </header>

      <TraceFilters view={view} filter={filter} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {view.entries.length} de {view.total} peticiones
        </p>
        <RevealToggle revealed={revealTokens} onChange={setRevealTokens} />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay peticiones para este filtro.</p>
      ) : (
        groups.map(({ step, entries }) => (
          <section key={step} aria-labelledby={`step-${step}`} className="flex flex-col gap-3">
            <h2 id={`step-${step}`} className="text-xl text-primary">
              {STEP_LABEL[step]} <span className="text-base font-normal text-muted-foreground">({entries.length})</span>
            </h2>
            <ul className="flex flex-col gap-3">
              {entries.map((entry) => (
                <TraceEntryCard key={entry.id} entry={entry} revealTokens={revealTokens} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const detail = error instanceof Response ? null : isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : null;
  return (
    <>
      <h1 className="text-2xl text-primary">No pudimos cargar la traza</h1>
      <p className="mt-2 text-muted-foreground">Revisa tu conexión y vuelve a intentarlo.</p>
      {detail && <p className="mt-2 text-sm text-destructive">{detail}</p>}
      <a href="" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Reintentar
      </a>
    </>
  );
}
