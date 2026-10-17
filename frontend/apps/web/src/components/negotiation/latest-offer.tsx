import type { Actor, QuoteRequest } from "@agro/shared/modules/presales/domain/presale";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { latestQuote } from "@agro/shared/modules/presales/domain/presale-rules";
import { formatDay, formatQuantity, type UnitRef } from "~/components/presale/format";

const AUTHOR_LABELS: Record<Actor, string> = { BUYER: "Comprador", PRODUCER: "Productor", SYSTEM: "Sistema", UNKNOWN: "Desconocido" };

// Inbox summary: the latest offer's terms are the headline; the original request is secondary information.
export function LatestOffer({ request, unit }: { request: QuoteRequest; unit: UnitRef | null }) {
  const latest = latestQuote(request);
  if (!latest) {
    return (
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Solicitado</dt>
          <dd className="font-semibold tabular-nums">{formatQuantity(request.quantity, unit)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Entrega deseada</dt>
          <dd className="font-semibold">{formatDay(request.desiredDeliveryDate)}</dd>
        </div>
      </dl>
    );
  }
  const terms = latest.terms;
  if (terms.kind === "MILESTONE") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Última oferta · {AUTHOR_LABELS[latest.author]}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Precio del hito</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(terms.price, latest.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Entrega</dt>
            <dd className="font-semibold">{terms.deliveryDate ? formatDay(terms.deliveryDate) : "Sin definir"}</dd>
          </div>
        </dl>
      </div>
    );
  }
  if (terms.kind === "PROJECT") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Última oferta · {AUTHOR_LABELS[latest.author]}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Cantidad</dt>
            <dd className="font-semibold tabular-nums">{formatQuantity(terms.quantity, terms)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Precio unitario</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(terms.unitPrice, latest.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Entrega</dt>
            <dd className="font-semibold">{terms.deliveryDate ? formatDay(terms.deliveryDate) : "Sin definir"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vigente hasta</dt>
            <dd className="font-semibold">{terms.validUntil ? formatDay(terms.validUntil) : "Sin vencimiento"}</dd>
          </div>
        </dl>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">Última oferta · {AUTHOR_LABELS[latest.author]}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Cantidad</dt>
          <dd className="font-semibold tabular-nums">{formatQuantity(latest.quantity, unit)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Precio unitario</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(latest.unitPrice, latest.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(latest.total, latest.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Vigente hasta</dt>
          <dd className="font-semibold">{latest.validUntil ? formatDay(latest.validUntil) : "Sin vencimiento"}</dd>
        </div>
      </dl>
      <p className="text-sm tabular-nums text-muted-foreground">Solicitado {formatQuantity(request.quantity, unit)}</p>
    </div>
  );
}
