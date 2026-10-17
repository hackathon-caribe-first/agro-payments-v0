import type { LineKind, Settlement } from "@agro/shared/modules/harvest-batches/domain/harvest";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatBp, formatDateTime } from "./format";
import { LineStateBadge } from "./status";

const LINE_LABEL: Record<LineKind, string> = {
  PLATFORM_FEE: "Comisión de la Plataforma",
  INVESTOR_CAPITAL: "Capital del inversor",
  INVESTOR_YIELD: "Rendimiento pactado",
  PRODUCER_NET: "Utilidad neta del productor",
  UNKNOWN: "Línea de pago",
};

// Read-only settlement: one independent payment per line, each with its own state and receipt, and the grant revocation proof.
export function SettlementTable({ settlement }: { settlement: Settlement }) {
  const sum = settlement.lines.reduce((total, l) => total + l.amount, 0);
  return (
    <section aria-label="Liquidación de la orden" className="flex flex-col gap-4">
      {settlement.loss && (
        <p role="status" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          <span className="font-semibold">✕ La venta no cubrió el capital y el rendimiento pactados. </span>
          El inversor asume la pérdida de {formatMoney(settlement.shortfall, settlement.currency)} y la utilidad del productor es {formatMoney(0, settlement.currency)}.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Orden de {formatMoney(settlement.total, settlement.currency)}. Se aplica en este orden: comisión ({formatBp(settlement.platformFeeBp)}), capital, rendimiento y, por último, la utilidad neta del productor.
      </p>
      <ul className="flex flex-col gap-3">
        {settlement.lines.map((line) => (
          <li key={line.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{LINE_LABEL[line.kind]}</p>
                <p className="text-sm text-muted-foreground">{line.beneficiaryName}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatMoney(line.amount, settlement.currency)}</p>
                <LineStateBadge state={line.state} />
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Comprobante</dt>
                <dd className="break-all tabular-nums">{line.receiptId ?? "Pendiente"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Pago entrante</dt>
                <dd className="break-all tabular-nums">{line.incomingPaymentId ?? "Pendiente"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Pago saliente</dt>
                <dd className="break-all tabular-nums">{line.outgoingPaymentId ?? "Pendiente"}</dd>
              </div>
              {line.executedAt && (
                <div>
                  <dt className="text-muted-foreground">Ejecutado</dt>
                  <dd className="tabular-nums">{formatDateTime(line.executedAt)}</dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
        <span className="text-muted-foreground">Suma de las líneas {sum === settlement.total ? "= total de la orden" : "(no coincide con el total)"}</span>
        <span className="font-semibold tabular-nums">{formatMoney(sum, settlement.currency)}</span>
      </p>
      {settlement.revocation && (
        <div className="rounded-lg bg-muted p-4 text-sm">
          <p className="font-semibold">✓ Autorización de la orden revocada</p>
          <p className="mt-1 text-muted-foreground">
            Prueba de revocación: respuesta {settlement.revocation.responseStatus} · tope {formatMoney(settlement.revocation.cap, settlement.currency)} · gastado{" "}
            {formatMoney(settlement.revocation.spent, settlement.currency)} · sobrante en la billetera del comprador {formatMoney(settlement.revocation.remaining, settlement.currency)} ·{" "}
            {formatDateTime(settlement.revocation.revokedAt)}
          </p>
        </div>
      )}
    </section>
  );
}
