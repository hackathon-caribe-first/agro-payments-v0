import type { PurchaseOrder } from "@agro/shared/modules/harvest-batches/domain/harvest";
import { computeLiquidation } from "@agro/shared/modules/harvest-batches/domain/liquidation";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatBp } from "./format";

// How the order total will be split once reception is confirmed (the same pure function the platform runs).
export function LiquidationPreview({ order }: { order: PurchaseOrder }) {
  const l = computeLiquidation({ total: order.total, platformFeeBp: order.platformFeeBp, capitalDue: order.capitalDue, yieldDue: order.yieldDue });
  const money = (n: number) => formatMoney(n, order.currency);
  return (
    <section aria-labelledby="preview-title" className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <h2 id="preview-title" className="text-lg text-primary">
        Liquidación prevista
      </h2>
      <p className="text-sm text-muted-foreground">Se calcula al confirmarse la recepción y se paga desde la billetera del comprador.</p>
      <dl className="flex flex-col gap-2 text-sm">
        <Row label={`Comisión de la Plataforma (${formatBp(order.platformFeeBp)})`} value={money(l.platformFee)} />
        <Row label="Capital del inversor" value={money(l.investorCapital)} />
        <Row label="Rendimiento pactado" value={money(l.investorYield)} />
        <Row label="Utilidad neta del productor" value={money(l.producerNet)} strong />
      </dl>
      {l.loss && (
        <p role="status" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          <span className="font-semibold">✕ La venta no cubre el capital y el rendimiento. </span>
          El inversor absorbería {money(l.shortfall)} y tu utilidad neta sería {money(0)}.
        </p>
      )}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
