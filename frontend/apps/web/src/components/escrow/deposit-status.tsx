import { CheckCircle2, Clock } from "lucide-react";
import type { DepositState } from "@agro/shared/modules/presales/domain/presale";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatDateTime } from "~/components/presale/format";

// State of the deposit of an agreed PROJECT negotiation. Announced politely because it changes after an action.
export function DepositStatus({ deposit, currency = "COP" }: { deposit: DepositState | null; currency?: string }) {
  if (!deposit || deposit.status === "UNKNOWN") return <p role="status" aria-live="polite" className="sr-only">Sin depósito</p>;
  const deposited = deposit.status === "DEPOSITED";
  const Icon = deposited ? CheckCircle2 : Clock;
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm">
      <p className="inline-flex items-center gap-1.5 font-semibold text-primary">
        <Icon aria-hidden="true" className="size-4" />
        {deposited ? "Depositado en la fiducia" : "Depósito pendiente"}
      </p>
      <p className="tabular-nums text-muted-foreground">
        Total de la cotización del proyecto: <span className="font-semibold text-foreground">{formatMoney(deposit.agreedTotal, currency)}</span>
      </p>
      {deposited && deposit.depositedAt && <p className="text-muted-foreground">{formatDateTime(deposit.depositedAt)}</p>}
    </div>
  );
}
