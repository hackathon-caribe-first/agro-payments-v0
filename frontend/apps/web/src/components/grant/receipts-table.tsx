import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { GrantSpendEvent } from "@agro/shared/modules/grants/domain/grant";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDateTime } from "~/components/presale/format";

// RF-15: one receipt per paid line, with both payment ids, amounts and the spent counter before and after.
export function ReceiptsTable({ receipts, currency }: { receipts: GrantSpendEvent[]; currency: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-primary">Comprobantes de pago</CardTitle>
      </CardHeader>
      <CardContent>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se ha pagado ninguna línea con este grant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
              <caption className="sr-only">Comprobantes de las líneas pagadas con este grant</caption>
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-semibold">Línea</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Beneficiario</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Recibe</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Comisión</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Debitado</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Gastado antes</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Gastado después</th>
                  <th scope="col" className="py-2 font-semibold">Pagos</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id} className="border-b align-top last:border-b-0">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <span className="block font-semibold">{r.concept}</span>
                      <span className="block text-xs text-muted-foreground">
                        <time dateTime={r.createdAt}>{formatDateTime(r.createdAt)}</time>
                      </span>
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Detalle técnico</summary>
                        <span className="block break-all">Clave de idempotencia: {r.idempotencyKey}</span>
                      </details>
                    </th>
                    <td className="py-2 pr-3">{r.beneficiary}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.received, currency)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.fee, currency)}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatMoney(r.debited, currency)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.spentBefore, currency)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.spentAfter, currency)}</td>
                    <td className="py-2">
                      <span className="block break-all text-xs">
                        <span className="text-muted-foreground">Entrante: </span>
                        {r.incomingPaymentId}
                      </span>
                      <span className="block break-all text-xs">
                        <span className="text-muted-foreground">Saliente: </span>
                        {r.outgoingPaymentId}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
