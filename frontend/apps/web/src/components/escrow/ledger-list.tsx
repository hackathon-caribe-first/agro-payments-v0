import type { ProjectLedger } from "@agro/shared/modules/escrow/application/use-cases";
import type { LedgerCategory } from "@agro/shared/modules/escrow/domain/ledger";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDateTime } from "~/components/presale/format";

const CATEGORY_LABELS: Record<LedgerCategory, string> = {
  BUYER_DEPOSIT: "Depósito del comprador",
  UNKNOWN: "Movimiento",
};

// The project's custody account: balance and every movement, newest first.
export function LedgerList({ ledger, currency = "COP" }: { ledger: ProjectLedger; currency?: string }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base text-primary">Fiducia del proyecto</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <p className="text-sm text-muted-foreground">
          Saldo en custodia: <span className="font-semibold tabular-nums text-foreground">{formatMoney(ledger.balance, currency)}</span>
        </p>
        {ledger.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay movimientos en la fiducia.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Movimientos de la fiducia</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-2 font-medium">
                  Fecha
                </th>
                <th scope="col" className="py-1 pr-2 font-medium">
                  Concepto
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="py-1.5 pr-2">{formatDateTime(entry.createdAt)}</td>
                  <td className="py-1.5 pr-2">{CATEGORY_LABELS[entry.category]}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{formatMoney(entry.amount, entry.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
