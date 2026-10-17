import type { Milestone } from "@agro/shared/api/client";
import { formatMoney, formatRate } from "@agro/shared/modules/milestones/milestone-state";
import { ActionForm } from "~/components/action-form";

type Line = Milestone["lines"][number];
type Receipt = NonNullable<Line["receipt"]>;
type Amount = NonNullable<Receipt["debitAmount"]>;

const KIND_LABEL: Record<Line["kind"], string> = {
  productor: "Productor",
  proveedor: "Proveedor",
  trabajadores: "Trabajadores",
  plataforma: "Plataforma",
};
const STATUS_LABEL: Record<Line["status"], string> = {
  pendiente: "○ Pendiente",
  en_cola: "◷ En cola",
  completado: "✓ Completado",
  fallido: "✕ Fallido",
};

const money = (a: Amount | null) => (a ? formatMoney(a.value, a.assetCode, a.assetScale) : "Pendiente");

// RF-23 receipt as the wallet reported it. Amounts in their own asset; the fee only exists when debit and receive share it.
function LineReceipt({ line, milestone }: { line: Line & { receipt: Receipt }; milestone: Milestone }) {
  const { receipt } = line;
  const settled = line.status === "completado";
  const { debitAmount: debit, receiveAmount: receive } = receipt;
  // Grant totals are in the grant's asset, which is the debit asset.
  const grantMoney = (value: number | null) =>
    value === null ? "Sin dato" : formatMoney(value, debit?.assetCode ?? milestone.currency, debit?.assetScale ?? milestone.assetScale);
  const crossAsset = Boolean(debit && receive && debit.assetCode !== receive.assetCode);
  const rate = receipt.rate ? formatRate(receipt.rate) : null;
  const fee =
    receipt.fee !== null && debit ? formatMoney(receipt.fee, debit.assetCode, debit.assetScale) : crossAsset ? "No aplica: monedas distintas" : "Pendiente";
  const rows: [string, string][] = [
    ["Debitado de la custodia", money(debit)],
    [settled ? "Recibido por el beneficiario" : "A recibir (cotizado)", money(receive)],
    ["Comisión de la red", fee],
  ];
  // Same-asset payments make the rate 1:1 noise; it only tells something across assets.
  if (crossAsset && debit && receive && rate) rows.push(["Tasa implícita", `1 ${debit.assetCode} = ${rate} ${receive.assetCode}`]);
  rows.push(["Permiso usado antes del pago", grantMoney(receipt.grantSpentBefore)], ["Permiso usado después del pago", grantMoney(receipt.grantSpentAfter)]);
  const ids: [string, string | null][] = [
    ["Pago entrante", receipt.incomingPaymentId],
    ["Pago saliente", receipt.outgoingPaymentId],
    ["Cotización", receipt.quoteId],
  ];
  return (
    <details className="rounded-md bg-muted px-3">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-primary">Ver recibo</summary>
      <p className={settled ? "text-sm font-semibold text-success" : "text-sm font-semibold text-muted-foreground"}>
        {settled ? "✓ Pago recibido por el beneficiario" : "◷ Recibo provisional: el pago sigue en cola"}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 py-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
        {ids.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all text-right">{value ?? "Pendiente"}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// `payable` shows the operator's pay button (only on a funded milestone); the producer line waits for approval.
// `receipts` adds each line's payment receipt under it (operator screen).
export function Lines({ milestone, payable = false, receipts = false }: { milestone: Milestone; payable?: boolean; receipts?: boolean }) {
  return (
    // ponytail: scrolls inside the card on narrow screens; switch to stacked rows if 320px becomes a primary target
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="sr-only">Pagos del hito por beneficiario</caption>
        <thead className="text-sm text-muted-foreground">
          <tr>
            <th className="py-1 font-semibold">Beneficiario</th>
            <th className="py-1 pl-4 text-right font-semibold">Monto</th>
            <th className="py-1 pl-6 font-semibold">Estado</th>
            {payable && <th className="py-1 pl-4 font-semibold">Acción</th>}
          </tr>
        </thead>
        <tbody>
          {milestone.lines.map((l) => [
            <tr key={l.id} className="border-t">
              <td className="py-2">
                {l.beneficiary} <span className="text-sm text-muted-foreground">({KIND_LABEL[l.kind]})</span>
              </td>
              <td className="whitespace-nowrap py-2 pl-4 text-right tabular-nums">{formatMoney(l.amount, milestone.currency, milestone.assetScale)}</td>
              <td className="whitespace-nowrap py-2 pl-6">{STATUS_LABEL[l.status]}</td>
              {payable && (
                <td className="py-2 pl-4">
                  {l.status === "pendiente" && !milestone.closedAt && (l.kind !== "productor" || milestone.status === "approved") ? (
                    <ActionForm id={milestone.id} intent="pay-line" label="Pagar">
                      <input type="hidden" name="lineId" value={l.id} />
                    </ActionForm>
                  ) : null}
                </td>
              )}
            </tr>,
            receipts && l.receipt ? (
              <tr key={`${l.id}-receipt`}>
                <td colSpan={payable ? 4 : 3} className="pb-2">
                  <LineReceipt line={{ ...l, receipt: l.receipt }} milestone={milestone} />
                </td>
              </tr>
            ) : null,
          ])}
        </tbody>
      </table>
    </div>
  );
}
