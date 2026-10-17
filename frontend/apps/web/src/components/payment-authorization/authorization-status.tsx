import { CheckCircle2, Clock } from "lucide-react";
import type { AuthorizationState } from "@agro/shared/modules/presales/domain/presale";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatDateTime } from "~/components/presale/format";

// State of the payment authorization of an agreed PROJECT negotiation. Announced politely because it changes after an action.
export function AuthorizationStatus({ authorization, currency = "COP" }: { authorization: AuthorizationState | null; currency?: string }) {
  if (!authorization || authorization.status === "UNKNOWN") {
    return (
      <p role="status" aria-live="polite" className="sr-only">
        Sin autorización de pago
      </p>
    );
  }
  const authorized = authorization.status === "AUTHORIZED";
  const Icon = authorized ? CheckCircle2 : Clock;
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm">
      <p className="inline-flex items-center gap-1.5 font-semibold text-primary">
        <Icon aria-hidden="true" className="size-4" />
        {authorized ? "Pago autorizado" : "Pago por autorizar"}
      </p>
      <p className="tabular-nums text-muted-foreground">
        Total de la cotización del proyecto: <span className="font-semibold text-foreground">{formatMoney(authorization.agreedTotal, currency)}</span>
      </p>
      {authorized && authorization.authorizedAt && <p className="text-muted-foreground">{formatDateTime(authorization.authorizedAt)}</p>}
    </div>
  );
}
