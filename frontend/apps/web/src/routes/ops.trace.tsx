import { isRouteErrorResponse, redirect, useRouteError } from "react-router";
import { useState } from "react";
import { STEP_LABEL, groupByStep, parseStep } from "@agro/shared/modules/trace/domain/trace";
import { RevealToggle } from "~/components/trace/reveal-toggle";
import { TraceEntryCard } from "~/components/trace/trace-entry";
import { TraceFilters } from "~/components/trace/trace-filters";
import { unwrapOps } from "~/panel/error-copy";
import { IS_HTTP } from "~/platform/transport";
import { trace } from "~/trace/module";
import type { Route } from "./+types/ops.trace";

export const meta = () => [{ title: "Traza de pagos · Surco" }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const params = new URL(request.url).searchParams;
  // Http mode: the payment receipts live on the custodian traces screen; this URL keeps working for old links.
  if (IS_HTTP) throw redirect(`/custodian/traces${new URL(request.url).search}`);
  const filter = {
    projectId: params.get("project") || undefined,
    milestoneId: params.get("milestone") || undefined,
    step: parseStep(params.get("step")),
  };
  return { filter, view: unwrapOps(await trace.loadTrace(filter)) };
}

export default function Trace({ loaderData }: Route.ComponentProps) {
  return <CurlTrace {...loaderData} />;
}

function CurlTrace({ filter, view }: Route.ComponentProps["loaderData"]) {
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
