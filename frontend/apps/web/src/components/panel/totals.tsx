import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { PanelTotals } from "@agro/shared/modules/panel/domain/panel";
import { Card, CardContent } from "@agro/shared/ui/card";
import { Progress } from "@agro/shared/ui/progress";

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="break-words text-2xl font-semibold tabular-nums text-primary">{value}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// Investor totals: authorized cap, spent, what stays in the wallet and how many payments were confirmed.
export function PanelTotalsView({ totals }: { totals: PanelTotals }) {
  return (
    <section aria-labelledby="totals-heading" className="flex flex-col gap-3">
      <h2 id="totals-heading" className="text-xl text-primary">
        Resumen
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-4">
        <Figure label="Tope autorizado" value={formatMoney(totals.cap, totals.currency)} />
        <Figure label="Gastado" value={formatMoney(totals.spent, totals.currency)} hint={`${totals.progressPct} % del tope`} />
        <Figure label="Sigue en tu billetera" value={formatMoney(totals.remainingInWallet, totals.currency)} hint="Lo que no se gasta no sale de tu billetera." />
        <Figure label="Pagos confirmados" value={String(totals.paymentsConfirmed)} />
      </div>
      <Progress value={totals.progressPct} aria-label="Gastado del total autorizado" aria-valuenow={totals.progressPct} />
    </section>
  );
}
