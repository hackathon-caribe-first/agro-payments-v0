import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Progress } from "@agro/shared/ui/progress";
import { mulDivFloor } from "@agro/shared/modules/payment-lines/domain/money";
import type { SplitContext, SplitPreview } from "@agro/shared/modules/payment-lines/domain/split";
import { money } from "./copy";

const percentOf = (part: number, whole: number) => (whole > 0 ? Math.min(100, mulDivFloor(part, 100, whole)) : 0);

// The cap, what the lines add up to and what stays in the investor's wallet. Totals are announced politely as they change.
export function SplitSummary({ ctx, preview }: { ctx: SplitContext; preview: SplitPreview }) {
  const planned = percentOf(preview.totalDebit, preview.cap);
  const over = preview.overBy > 0;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-lg text-primary">Resumen del hito</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4">
        <div aria-live="polite" className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Tope del hito (presupuesto máximo)" value={money(ctx, preview.cap)} strong />
            {preview.reserve > 0 && <Row label="Fondo de imprevistos (dentro del tope)" value={money(ctx, preview.reserve)} />}
            {preview.reserve > 0 && <Row label="Tope para líneas normales" value={money(ctx, preview.ordinaryCap)} />}
            <Row label="Σ Recibe" value={money(ctx, preview.sumReceive)} />
            <Row label="Σ Comisión estimada" value={money(ctx, preview.sumCommission)} />
            <Row label="Total debitado al inversor" value={money(ctx, preview.totalDebit)} strong danger={over} />
            <Row label="Ya pagado" value={money(ctx, preview.paidDebit)} />
          </dl>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tope comprometido</span>
              <span className={over ? "font-semibold text-destructive" : "font-semibold"}>
                {over ? "✕ " : ""}
                {mulDivFloor(preview.totalDebit, 100, Math.max(preview.cap, 1))} %
              </span>
            </div>
            <Progress value={planned} aria-label="Porcentaje del tope del hito comprometido en líneas de pago" />
          </div>

          <div className="rounded-lg border bg-muted p-3 text-sm">
            <p className="text-muted-foreground">Sobrante no ejecutado</p>
            <p className="text-lg font-semibold tabular-nums">{money(ctx, preview.unspent)}</p>
            <p className="text-muted-foreground">Sigue en la billetera del inversor: no pasa al productor.</p>
          </div>
        </div>

        {preview.warnings.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-primary">Avisos</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {preview.warnings.map((w, i) => (
                <li key={`${w.code}-${i}`} className={w.code === "over_cap" || w.code === "over_reserve" ? "font-semibold text-destructive" : "text-foreground"}>
                  <span aria-hidden="true">{w.code === "over_cap" || w.code === "over_reserve" ? "✕ " : "⚠ "}</span>
                  {w.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""} ${danger ? "text-destructive" : ""}`}>{value}</dd>
    </div>
  );
}
