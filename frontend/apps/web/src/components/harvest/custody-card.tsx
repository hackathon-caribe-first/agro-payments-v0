import type { Custody } from "@agro/shared/modules/harvest/domain/harvest";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";

const CATEGORY_LABELS: Record<string, string> = {
  BUYER_DEPOSIT: "Depósitos del comprador",
  INVESTOR_CAPITAL: "Aportes de inversionistas",
  HARVEST_PAYMENT: "Pago de la cosecha",
  INDEMNITY: "Indemnización del seguro",
};

const DEBIT_LABELS: Record<string, string> = {
  PREMIUM: "Prima neta del seguro",
};

// RF-21: what is still in custody. With an observed milestone the grant stays alive but nothing more is paid, so this is the money
// that keeps waiting for the correction (or for the cascade).
export function CustodyCard({ custody, note }: { custody: Custody; note?: string }) {
  const money = (amount: number) => formatMoney(amount, custody.currency);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base text-primary">Saldo en custodia</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <p className="text-2xl font-semibold tabular-nums text-primary">{money(custody.balance)}</p>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          {custody.credits.map((c) => (
            <div key={c.category} className="contents">
              <dt className="text-muted-foreground">{CATEGORY_LABELS[c.category] ?? "Otros ingresos"}</dt>
              <dd className="text-right tabular-nums">+ {money(c.amount)}</dd>
            </div>
          ))}
          {custody.debits.map((d) => (
            <div key={d.category} className="contents">
              <dt className="text-muted-foreground">{DEBIT_LABELS[d.category] ?? "Otros egresos"}</dt>
              <dd className="text-right tabular-nums">− {money(d.amount)}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">Pagado en hitos</dt>
          <dd className="text-right tabular-nums">− {money(custody.milestoneDebits)}</dd>
          {custody.settlementDebits > 0 && (
            <>
              <dt className="text-muted-foreground">Pagado en la liquidación</dt>
              <dd className="text-right tabular-nums">− {money(custody.settlementDebits)}</dd>
            </>
          )}
        </dl>
        <p className="text-sm text-muted-foreground">Entorno de simulación · Sin dinero real</p>
      </CardContent>
    </Card>
  );
}
