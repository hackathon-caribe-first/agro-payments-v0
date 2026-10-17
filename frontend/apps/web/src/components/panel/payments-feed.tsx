import { Link } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { FeedItem } from "@agro/shared/modules/panel/domain/panel";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDateTime } from "~/components/presale/format";

// Line payments and their receipts, newest first (RF-19). A payment confirmed by the platform shows up here on the next refresh.
export function PaymentsFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-primary">Pagos y comprobantes</CardTitle>
      </CardHeader>
      <CardContent>
        {feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se ha pagado ninguna línea. Cuando se confirme un pago, aparece aquí.</p>
        ) : (
          <ol className="flex flex-col">
            {feed.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold">
                    {item.concept} · {item.beneficiary}
                  </p>
                  <p className="font-semibold tabular-nums">{formatMoney(item.received, item.currency)}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.projectTitle} · {item.milestoneTitle} · <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                </p>
                <p className="text-sm text-muted-foreground">
                  Comisión {formatMoney(item.fee, item.currency)} · Debitado de tu billetera {formatMoney(item.debited, item.currency)}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  Entrante: {item.incomingPaymentId} · Saliente: {item.outgoingPaymentId}
                </p>
                <Link to={`/investor/grants/${item.grantId}`} className="self-start text-sm font-bold text-primary underline underline-offset-4">
                  Ver comprobante en el grant
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
