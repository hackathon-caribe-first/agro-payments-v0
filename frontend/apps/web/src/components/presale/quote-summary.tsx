import type { SaleQuote } from "@agro/shared/modules/presales/domain/presale";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatDay, formatQuantity, type UnitRef } from "./format";
import { QuoteStatusBadge } from "./status-badges";

export function QuoteSummary({ quote, unit }: { quote: SaleQuote; unit: UnitRef | null }) {
  return (
    <section aria-labelledby={`quote-${quote.revision}-heading`} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`quote-${quote.revision}-heading`} className="text-base text-primary">
          Cotización de venta
        </h3>
        <QuoteStatusBadge status={quote.status} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Cantidad</dt>
        <dd className="text-right tabular-nums">{formatQuantity(quote.quantity, unit)}</dd>
        <dt className="text-muted-foreground">Precio unitario</dt>
        <dd className="text-right tabular-nums">{formatMoney(quote.unitPrice, quote.currency)}</dd>
        <dt className="font-semibold">Total</dt>
        <dd className="text-right font-semibold tabular-nums">{formatMoney(quote.total, quote.currency)}</dd>
        <dt className="text-muted-foreground">Vigente hasta</dt>
        <dd className="text-right">{formatDay(quote.validUntil)}</dd>
      </dl>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Condiciones: </span>
        {quote.deliveryTerms}
      </p>
    </section>
  );
}
