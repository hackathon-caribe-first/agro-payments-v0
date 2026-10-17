import type { PaymentAuthorization, PaymentAuthorizationStatus } from "@agro/shared/modules/payment-authorization/domain/authorization";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDateTime } from "~/components/presale/format";

const STATUS_LABELS: Record<PaymentAuthorizationStatus, string> = {
  AUTHORIZED: "Autorizada",
  REVOKED: "Revocada",
  UNKNOWN: "Sin estado",
};

// Read-only list of the payment authorizations granted on a project, newest first: date, cap, spent and status.
export function AuthorizationList({
  authorizations,
  title = "Autorizaciones de pago",
  emptyText = "Aún no hay autorizaciones de pago.",
}: {
  authorizations: readonly PaymentAuthorization[];
  title?: string;
  emptyText?: string;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base text-primary">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        {authorizations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Autorizaciones de pago del proyecto</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-2 font-medium">
                  Fecha
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Tope
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Gastado
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {authorizations.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="py-1.5 pr-2">{formatDateTime(a.createdAt)}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{formatMoney(a.cap, a.currency)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(a.spent, a.currency)}</td>
                  <td className="py-1.5 text-right">{STATUS_LABELS[a.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
