import type { Actor, SaleQuote } from "@agro/shared/modules/presales/domain/presale";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatDay, formatQuantity, type UnitRef } from "~/components/presale/format";
import { OfferStatusBadge } from "./status-badge";

const AUTHOR_LABELS: Record<Actor, string> = { BUYER: "Comprador", PRODUCER: "Productor", SYSTEM: "Sistema", UNKNOWN: "Desconocido" };

// One round's terms. Revision 1 is the initial offer; later revisions are counter-offers.
export function TermsSummary({
  quote,
  unit,
  authorizedTotal = null,
}: {
  quote: SaleQuote;
  unit: UnitRef | null;
  // Total of the project quotation covered by the payment authorization (PROJECT scope only).
  authorizedTotal?: number | null;
}) {
  const heading = quote.revision === 1 ? "Oferta" : "Contraoferta";
  const terms = quote.terms;
  if (terms.kind === "PROJECT" || terms.kind === "MILESTONE") {
    return (
      <section aria-labelledby={`terms-${quote.revision}-heading`} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`terms-${quote.revision}-heading`} className="text-base text-primary">
            {heading} {quote.revision} · {AUTHOR_LABELS[quote.author]}
          </h3>
          <OfferStatusBadge status={quote.status} />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {terms.kind === "PROJECT" ? (
            <>
              <dt className="text-muted-foreground">Cantidad</dt>
              <dd className="text-right tabular-nums">{formatQuantity(terms.quantity, terms)}</dd>
              <dt className="text-muted-foreground">Precio unitario</dt>
              <dd className="text-right tabular-nums">{formatMoney(terms.unitPrice, quote.currency)}</dd>
              <dt className="text-muted-foreground">Valor de la oferta</dt>
              <dd className="text-right tabular-nums">{formatMoney(quote.total, quote.currency)}</dd>
              {authorizedTotal !== null && authorizedTotal !== quote.total && (
                <div className="col-span-2">
                  <dd className="text-pretty text-xs text-muted-foreground">
                    Valor registrado de la oferta; el pago autorizado corresponde al total de la cotización del proyecto.
                  </dd>
                </div>
              )}
            </>
          ) : (
            <>
              <dt className="font-semibold">Precio del hito</dt>
              <dd className="text-right font-semibold tabular-nums">{formatMoney(terms.price, quote.currency)}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Entrega</dt>
          <dd className="text-right">{terms.deliveryDate ? formatDay(terms.deliveryDate) : "Sin definir"}</dd>
          {terms.kind === "PROJECT" && (
            <>
              <dt className="text-muted-foreground">Vigente hasta</dt>
              <dd className="text-right">{terms.validUntil ? formatDay(terms.validUntil) : "Sin vencimiento"}</dd>
            </>
          )}
        </dl>
        {terms.notes && (
          <p className="text-pretty text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Notas: </span>
            {terms.notes}
          </p>
        )}
      </section>
    );
  }
  return (
    <section aria-labelledby={`terms-${quote.revision}-heading`} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`terms-${quote.revision}-heading`} className="text-base text-primary">
          {heading} {quote.revision} · {AUTHOR_LABELS[quote.author]}
        </h3>
        <OfferStatusBadge status={quote.status} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Cantidad</dt>
        <dd className="text-right tabular-nums">{formatQuantity(quote.quantity, unit)}</dd>
        <dt className="text-muted-foreground">Precio unitario</dt>
        <dd className="text-right tabular-nums">{formatMoney(quote.unitPrice, quote.currency)}</dd>
        <dt className="font-semibold">Total</dt>
        <dd className="text-right font-semibold tabular-nums">{formatMoney(quote.total, quote.currency)}</dd>
        {quote.deliveryDate && (
          <>
            <dt className="text-muted-foreground">Entrega</dt>
            <dd className="text-right">{formatDay(quote.deliveryDate)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Vigente hasta</dt>
        <dd className="text-right">{quote.validUntil ? formatDay(quote.validUntil) : "Sin vencimiento"}</dd>
      </dl>
      <p className="text-pretty text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Condiciones: </span>
        {quote.deliveryTerms}
      </p>
    </section>
  );
}
