import { ArrowLeft } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { type InvestorPanel, pctText, spentPct } from "@agro/shared/modules/harvest/domain/harvest";
import { rateText } from "@agro/shared/modules/investments/domain/investment";
import { formatMoney, type Tone } from "@agro/shared/modules/milestones/milestone-state";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Progress } from "@agro/shared/ui/progress";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import { CaptureBar, SimulationNotice } from "~/components/investor/capture-bar";
import { CustodyCard } from "~/components/harvest/custody-card";
import { formatDateTime } from "~/components/presale/format";
import type { ProjectStatus } from "@agro/shared/modules/projects/domain/project";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { harvest } from "~/harvest/module";
import type { Route } from "./+types/investor.project.panel";

export const meta = () => [{ title: "Panel del inversionista · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await harvest.panel(params.projectId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response("No pudimos cargar el panel.", { status: 502 });
  }
  return result.value;
}

// RF-13 / RF-22: a milestone's grant is pending until the fiduciaria approves it, alive while it pays, revoked once closed.
const GRANT: Record<string, { label: string; tone: Tone; symbol: string }> = {
  pending: { label: "Grant sin aprobar", tone: "neutral", symbol: "○" },
  active: { label: "Grant vivo", tone: "success", symbol: "●" },
  revoked: { label: "Grant revocado", tone: "neutral", symbol: "■" },
};

const foreignMoney = (a: { value: string; assetCode: string; assetScale: number }) => formatMoney(Number(a.value), a.assetCode, a.assetScale);

function Returns({ panel }: { panel: InvestorPanel }) {
  const { realized, median } = panel;
  const currency = realized.status === "settled" ? realized.investorCurrency : (median?.investorCurrency ?? "COP");
  const rows = [
    { label: "En pesos (COP)", realized: realized.status === "settled" ? realized.tirCopPct : null, median: median?.tirCopPct ?? null },
    ...(currency !== "COP"
      ? [{ label: `En tu moneda (${currency})`, realized: realized.status === "settled" ? realized.tirInvestorCurrencyPct : null, median: median?.tirInvestorCurrencyPct ?? null }]
      : []),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-primary">TIR realizada frente a la mediana simulada</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-semibold">Moneda</th>
              <th className="py-1 text-right font-semibold">Realizada</th>
              <th className="py-1 text-right font-semibold">Mediana simulada</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t">
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-right font-semibold tabular-nums">{realized.status === "settled" ? pctText(r.realized) : "Pendiente"}</td>
                <td className="py-2 text-right tabular-nums">{pctText(r.median)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {realized.status === "pending" ? (
          <p className="text-sm text-muted-foreground">La TIR realizada aparece cuando la liquidación del proyecto termina de pagar.</p>
        ) : (
          <p className="text-sm text-muted-foreground tabular-nums">
            Aportaste {formatMoney(realized.capital, panel.project.currency)} y recibiste {formatMoney(realized.returned, panel.project.currency)} en {realized.days} días.
            {realized.exitRateAssumed ? " La TIR en tu moneda supone la misma tasa de salida que la de entrada: el comprobante no trae el monto recibido." : ""}
          </p>
        )}
        {!median && <p className="text-sm text-muted-foreground">El proyecto aún no tiene una simulación para comparar.</p>}
      </CardContent>
    </Card>
  );
}

export default function InvestorProjectPanel({ loaderData: panel }: Route.ComponentProps) {
  const { project, capture, custody, milestones, investments } = panel;
  const money = (amount: number) => formatMoney(amount, project.currency);
  return (
    <div className="flex flex-col gap-6">
      <Link to={`/investor/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al proyecto
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{project.projectCode} · Panel del inversionista</p>
          <h1 className="break-words text-3xl text-primary">{project.title}</h1>
          <SimulationNotice />
        </div>
        <ProjectStatusBadge status={project.currentStatus as ProjectStatus} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <CustodyCard custody={custody} />
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base text-primary">Captación</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <CaptureBar capture={{ ...capture, currency: project.currency }} detailed />
            </CardContent>
          </Card>
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Returns panel={panel} />

          <section aria-labelledby="grants-heading" className="flex flex-col gap-3">
            <h2 id="grants-heading" className="text-xl text-primary">
              Hitos: gastado frente al tope del grant
            </h2>
            {milestones.length === 0 && <p className="text-muted-foreground">Este proyecto no tiene hitos.</p>}
            <ul className="flex flex-col gap-3">
              {milestones.map((m) => (
                <li key={m.id} className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {m.sequenceOrder ? `${m.sequenceOrder}. ` : ""}
                      {m.title}
                    </span>
                    <StatusBadge {...(GRANT[m.grant.status] ?? { label: "Grant", tone: "neutral", symbol: "○" })} />
                  </div>
                  <Progress value={spentPct(m.grant)} aria-label={`${m.title}: ${spentPct(m.grant)} % del tope gastado`} />
                  <p className="tabular-nums text-muted-foreground">
                    Gastado {money(m.grant.spent)} de {money(m.grant.cap)} · disponible {money(m.grant.remaining)}
                  </p>
                  {m.lines.some((l) => l.status === "completado" || l.status === "en_cola") && (
                    <ul className="flex flex-col gap-1">
                      {m.lines
                        .filter((l) => l.status === "completado" || l.status === "en_cola")
                        .map((l) => (
                          <li key={l.id} className="flex flex-wrap justify-between gap-2 tabular-nums">
                            <span>
                              {l.beneficiary} · {l.status === "completado" ? "✓ pagado" : "◷ en cola"}
                            </span>
                            <span>
                              {money(l.amount)}
                              {l.outgoingPaymentId ? ` · comprobante ${l.outgoingPaymentId.split("/").at(-1)}` : ""}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="investments-heading" className="flex flex-col gap-3">
            <h2 id="investments-heading" className="text-xl text-primary">
              Tus aportes y comprobantes
            </h2>
            {investments.length === 0 && <p className="text-muted-foreground">Aún no has invertido en este proyecto.</p>}
            <ul className="flex flex-col gap-3">
              {investments.map((i) => {
                const rate = i.impliedRate ? rateText(i.impliedRate) : null;
                return (
                  <li key={i.id} className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
                    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2">
                      {i.debit && (
                        <div>
                          <dt className="text-muted-foreground">Debitado de tu billetera</dt>
                          <dd className="tabular-nums">{foreignMoney(i.debit)}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-muted-foreground">Recibido en custodia</dt>
                        <dd className="tabular-nums">{money(i.receiveAmount ?? i.amount)}</dd>
                      </div>
                      {rate && i.debit && (
                        <div>
                          <dt className="text-muted-foreground">Tasa de entrada</dt>
                          <dd className="tabular-nums">
                            {rate} {i.currency}/{i.debit.assetCode}
                          </dd>
                        </div>
                      )}
                      {i.capturedAt && (
                        <div>
                          <dt className="text-muted-foreground">Captado</dt>
                          <dd className="tabular-nums">{formatDateTime(i.capturedAt)}</dd>
                        </div>
                      )}
                    </dl>
                    {i.payouts.map((p) => (
                      <p key={p.id} className="tabular-nums">
                        Liquidación: {money(p.amount)} desde la custodia
                        {p.receiveAmount ? ` → ${foreignMoney(p.receiveAmount)} en tu billetera` : ""} · {p.status === "executed" ? "✓ pagado" : "◷ en proceso"}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          </section>
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
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este panel" : "No pudimos cargar el panel"}</h1>
      <p className="mt-2 text-muted-foreground">{notFound ? "Puede que el enlace sea incorrecto o que no tengas acceso a este proyecto." : "Intenta de nuevo en unos minutos."}</p>
      <Link to="/investor" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a los proyectos
      </Link>
    </>
  );
}
