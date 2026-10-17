import type { ReconciliationSummary } from "@agro/shared/modules/reconciliation/domain/reconciliation";
import { Progress } from "@agro/shared/ui/progress";
import { StatusBadge } from "@agro/shared/ui/status-badge";

// Success metric of the pilot: receipts that match the incoming payments must reach 100 %.
export function ReconciliationSummaryView({ summary }: { summary: ReconciliationSummary }) {
  const perfect = summary.matchedPct === 100 && summary.withoutReceipt === 0;
  return (
    <section aria-labelledby="summary-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="summary-heading" className="text-xl text-primary">
          <span aria-live="polite">
            {summary.matched} de {summary.receipts} comprobantes cuadran ({summary.matchedPct} %)
          </span>
        </h2>
        {perfect ? <StatusBadge label="Meta del piloto cumplida" tone="success" symbol="✓" /> : <StatusBadge label="Meta del piloto: 100 %" tone="warning" symbol="◷" />}
      </div>
      <Progress value={summary.matchedPct} aria-label="Comprobantes que cuadran" aria-valuenow={summary.matchedPct} />
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Con diferencia</dt>
          <dd className="text-lg font-semibold tabular-nums">{summary.different}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Falta comprobante</dt>
          <dd className="text-lg font-semibold tabular-nums">{summary.missingIncoming}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sin comprobante</dt>
          <dd className="text-lg font-semibold tabular-nums">{summary.withoutReceipt}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Filas conciliadas</dt>
          <dd className="text-lg font-semibold tabular-nums">{summary.reviewed}</dd>
        </div>
      </dl>
    </section>
  );
}
