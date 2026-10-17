import { ArrowLeft, Check, Copy } from "lucide-react";
import { useState } from "react";
import { Form, Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Label } from "@agro/shared/ui/label";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import { loadTraces, type OpTrace } from "~/support/traces";
import type { Route } from "./+types/custodian.traces";

export const meta = () => [{ title: "Traza · Surco" }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const projectId = new URL(request.url).searchParams.get("project_id")?.trim() || null;
  const result = await loadTraces(projectId);
  return { projectId, traces: result.ok ? result.value : [], error: result.ok ? null : result.message };
}

const when = (iso: string) => new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "medium" });

function StatusOf({ trace }: { trace: OpTrace }) {
  if (trace.error) return <StatusBadge label={trace.status ? `Error ${trace.status}` : "Error"} tone="danger" symbol="✕" />;
  return <StatusBadge label={String(trace.status ?? "—")} tone="success" symbol="✓" />;
}

function CopyCurl({ curl }: { curl: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(curl).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button type="button" variant="outline" size="compact" onClick={() => void copy()} aria-live="polite">
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copiado" : "Copiar curl"}
    </Button>
  );
}

const correlation = (t: OpTrace) =>
  [
    t.project_id && `proyecto ${t.project_id}`,
    t.milestone_id && `hito ${t.milestone_id}`,
    t.negotiation_id && `negociación ${t.negotiation_id}`,
    t.investment_id && `inversión ${t.investment_id}`,
    t.settlement_id && `liquidación ${t.settlement_id}`,
  ]
    .filter(Boolean)
    .join(" · ");

// RF-28: every request the backend made to Open Payments, as curl with tokens trimmed (first 6 characters + «…»).
export default function CustodianTraces({ loaderData }: Route.ComponentProps) {
  const { projectId, traces, error } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/custodian" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a pagos
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl text-primary">Traza de Open Payments</h1>
        <p className="text-muted-foreground">
          Cada petición de la plataforma a las billeteras, de la más reciente a la más antigua. Los tokens, nonces y referencias de
          interacción se muestran recortados: el curl sirve para soporte, no para repetir el pago.
        </p>
        <p className="text-sm font-semibold text-muted-foreground">Entorno de simulación · Sin dinero real</p>
      </header>

      <Form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="project_id">Proyecto (id)</Label>
          <Input id="project_id" name="project_id" defaultValue={projectId ?? ""} placeholder="Todos los proyectos" className="w-72 max-w-full" />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </Form>

      {error && (
        <p role="alert" className="rounded-md border border-destructive bg-card px-4 py-3 font-semibold text-destructive">
          ✕ {error}
        </p>
      )}
      {!error && traces.length === 0 && <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no hay peticiones registradas.</p>}

      <ul className="flex flex-col gap-3">
        {traces.map((t) => (
          <li key={t.id} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold">{t.method}</span>
              <span className="min-w-0 break-all font-mono text-sm">{t.url}</span>
              <StatusOf trace={t} />
              <span className="text-sm text-muted-foreground tabular-nums">
                {t.duration_ms} ms · {when(t.created_at)}
              </span>
            </div>
            {correlation(t) && <p className="text-sm text-muted-foreground">{correlation(t)}</p>}
            {t.error && <p className="text-sm text-destructive">{t.error}</p>}
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm whitespace-pre-wrap break-all">{t.curl}</pre>
            {t.response_summary && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-primary">Respuesta</summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm whitespace-pre-wrap break-all">{t.response_summary}</pre>
              </details>
            )}
            <div>
              <CopyCurl curl={t.curl} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
