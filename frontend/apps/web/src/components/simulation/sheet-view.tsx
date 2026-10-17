import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { SimulationSheet } from "@agro/shared/modules/simulation/domain/sheet";

const pct = (x: number) => `${x.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const rate = (x: number) => x.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const cop = (x: number) => formatMoney(x, "COP");
const runs = (n: number) => n.toLocaleString("es-CO");

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold tabular-nums text-primary">{value}</dd>
      {hint && <dd className="text-sm text-muted-foreground">{hint}</dd>}
    </div>
  );
}

// The verdict is text + symbol + color, never color alone.
function Verdict({ sheet }: { sheet: SimulationSheet }) {
  const { offer } = sheet;
  if (offer.publishable) {
    return (
      <div role="status" className="rounded-lg border bg-card p-4">
        <p className="font-brand text-lg font-bold text-success">✓ Cumple la regla de oferta</p>
        <p className="mt-1 text-muted-foreground">
          La mediana simulada de la TIR en pesos ({pct(sheet.tirPct.median)}) alcanza el retorno a ofrecer ({pct(offer.offeredReturnPct)}) y la
          cobertura ({rate(sheet.coverageBase)}) pasa el mínimo de {rate(sheet.coverageMinBase)}.
        </p>
      </div>
    );
  }
  return (
    <div role="status" className="rounded-lg border border-destructive bg-card p-4">
      <p className="font-brand text-lg font-bold text-destructive">✕ No se puede publicar todavía</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {offer.reasons.map((r) => (
          <li key={r.code}>{r.message}</li>
        ))}
      </ul>
      {offer.minimumContractPricePerKg !== null && (
        <p className="mt-3 font-semibold tabular-nums">
          Precio mínimo de contrato para publicar: {cop(offer.minimumContractPricePerKg)} por kg (hoy: {cop(offer.contractPricePerKg)} por kg).
        </p>
      )}
    </div>
  );
}

export function SheetView({ sheet }: { sheet: SimulationSheet }) {
  return (
    <div className="flex flex-col gap-6">
      <Verdict sheet={sheet} />

      <section aria-labelledby="sheet-kpis" className="flex flex-col gap-3">
        <h2 id="sheet-kpis" className="text-lg text-primary">
          {sheet.crop} · nivel {sheet.level}
        </h2>
        <dl className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))]">
          <Kpi label="Capital a levantar (K)" value={cop(sheet.capital)} hint={`Incluye la prima del seguro: ${cop(sheet.insurancePremium)}`} />
          <Kpi label="TIR mediana en pesos" value={pct(sheet.tirPct.median)} hint={`P10 ${pct(sheet.tirPct.p10)} · P90 ${pct(sheet.tirPct.p90)}`} />
          <Kpi label="Probabilidad de perder capital" value={pct(sheet.probCapitalLossPct)} hint={`Preserva el valor real: ${pct(sheet.probValuePreservedPct)}`} />
          <Kpi label="Cobertura" value={rate(sheet.coverageBase)} hint={`Mínimo ${rate(sheet.coverageMinBase)} · estresada ${rate(sheet.coverageStress)}`} />
        </dl>
      </section>

      <section aria-labelledby="sheet-milestones" className="flex flex-col gap-3">
        <h2 id="sheet-milestones" className="text-lg text-primary">
          Calendario de hitos y presupuestos
        </h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[40rem] text-left text-sm tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">Hito</th>
                <th className="p-3 font-semibold">Día</th>
                <th className="p-3 text-right font-semibold">Presupuesto</th>
                <th className="p-3 text-right font-semibold">Insumos</th>
                <th className="p-3 text-right font-semibold">Jornales</th>
                <th className="p-3 text-right font-semibold">Fee 3 %</th>
                <th className="p-3 text-right font-semibold">Imprevistos</th>
              </tr>
            </thead>
            <tbody>
              {sheet.milestones.map((m) => (
                <tr key={m.sequence} className="border-t">
                  <td className="p-3">
                    {m.sequence}. {m.title}
                  </td>
                  <td className="p-3">{m.day}</td>
                  <td className="p-3 text-right font-semibold">{cop(m.budget)}</td>
                  <td className="p-3 text-right">{cop(m.supplies)}</td>
                  <td className="p-3 text-right">{cop(m.labor)}</td>
                  <td className="p-3 text-right">{cop(m.fee)}</td>
                  <td className="p-3 text-right">{cop(m.contingency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {sheet.currencies.length > 0 && (
        <section aria-labelledby="sheet-currencies" className="flex flex-col gap-3">
          <h2 id="sheet-currencies" className="text-lg text-primary">
            TIR en la moneda del inversionista
          </h2>
          <p className="text-muted-foreground">
            Si el peso se devalúa entre la entrada y la salida, el inversionista en divisa gana menos. La TRM de equilibrio es la tasa de salida
            con la que recupera exactamente su capital.
          </p>
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
            {sheet.currencies.map((c) => (
              <div key={c.currency} className="rounded-lg border bg-card p-4">
                <p className="font-brand font-bold text-primary">{c.currency}</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  Entrada {rate(c.entryRate)} COP · equilibrio {rate(c.equilibriumRate)} COP
                </p>
                <table className="mt-3 w-full text-left text-sm tabular-nums">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 font-semibold">TRM de salida</th>
                      <th className="py-1 text-right font-semibold">TIR esperada</th>
                      <th className="py-1 text-right font-semibold">TIR mediana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.exits.map((e) => (
                      <tr key={e.exitRate} className="border-t">
                        <td className="py-1">{rate(e.exitRate)}</td>
                        <td className="py-1 text-right">{pct(e.tirBasePct)}</td>
                        <td className="py-1 text-right">{pct(e.tirPct.median)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        Motor {sheet.motorVersion} · semilla {sheet.seed} · {runs(sheet.runs)} escenarios Monte Carlo · recuperación esperada {pct(sheet.baseRecoveryPct)}.
        El retorno publicado sale de la simulación: no es una promesa.
      </p>
    </div>
  );
}
