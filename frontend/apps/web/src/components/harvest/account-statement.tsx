import type { LineKind, Settlement } from "@agro/shared/modules/harvest/domain/harvest";
import { orderCode } from "./format";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { SettlementTable } from "./settlement-table";

const paid = (settlements: Settlement[], kind: LineKind) =>
  settlements.flatMap((s) => s.lines).filter((l) => l.kind === kind && l.state === "completado").reduce((sum, l) => sum + l.amount, 0);

export const totals = (settlements: Settlement[]) => ({
  gross: settlements.reduce((sum, s) => sum + s.total, 0),
  fee: paid(settlements, "PLATFORM_FEE"),
  capital: paid(settlements, "INVESTOR_CAPITAL"),
  yield: paid(settlements, "INVESTOR_YIELD"),
  producerNet: paid(settlements, "PRODUCER_NET"),
});

function Summary({ rows }: { rows: Array<[string, string, boolean?]> }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-3 rounded-lg border bg-card p-5 text-sm">
      {rows.map(([label, value, strong]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className={`tabular-nums ${strong ? "text-lg font-semibold text-primary" : "font-semibold"}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Producer's final account statement (RF-22, display only): totals and every settlement with its receipts.
export function ProducerStatement({ settlements }: { settlements: Settlement[] }) {
  const t = totals(settlements);
  const currency = settlements[0]?.currency ?? "COP";
  const money = (n: number) => formatMoney(n, currency);
  return (
    <div className="flex flex-col gap-6">
      <Summary
        rows={[
          ["Ventas liquidadas", money(t.gross)],
          ["Comisión de la Plataforma", money(t.fee)],
          ["Capital devuelto al inversor", money(t.capital)],
          ["Rendimiento del inversor", money(t.yield)],
          ["Utilidad neta del productor", money(t.producerNet), true],
        ]}
      />
      {settlements.map((s) => (
        <details key={s.id} open={settlements.length === 1} className="rounded-lg border bg-card p-5">
          <summary className="cursor-pointer text-base font-semibold">
            Orden {orderCode(s.orderId)} · {s.buyerName} · <span className="tabular-nums">{money(s.total)}</span>
          </summary>
          <div className="mt-4">
            <SettlementTable settlement={s} />
          </div>
        </details>
      ))}
    </div>
  );
}

// Investor's balance (RF-22, display only): capital and agreed yield against what was actually received.
export function InvestorBalance({ settlements }: { settlements: Settlement[] }) {
  const ordered = [...settlements].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = ordered[0];
  const t = totals(settlements);
  const currency = first?.currency ?? "COP";
  const money = (n: number) => formatMoney(n, currency);
  const invested = first?.capitalDue ?? 0;
  const agreedYield = first?.yieldDue ?? 0;
  const received = t.capital + t.yield;
  const result = received - invested;
  return (
    <div className="flex flex-col gap-4">
      <Summary
        rows={[
          ["Capital invertido", money(invested)],
          ["Rendimiento pactado", money(agreedYield)],
          ["Capital recibido", money(t.capital)],
          ["Rendimiento recibido", money(t.yield)],
          ["Total recibido", money(received)],
          [result >= 0 ? "Resultado: ganancia" : "Resultado: pérdida", money(Math.abs(result)), true],
        ]}
      />
      {result < 0 && (
        <p role="status" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          <span className="font-semibold">✕ La venta no cubrió el capital y el rendimiento pactados. </span>
          El inversor asume la diferencia, como se acordó en el contrato. La pérdida de este balance compara lo recibido con el capital invertido; el faltante de cada orden lo compara con el capital más el rendimiento pactados.
        </p>
      )}
    </div>
  );
}
