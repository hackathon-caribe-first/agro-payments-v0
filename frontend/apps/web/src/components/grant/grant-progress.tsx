import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { MilestoneGrant } from "@agro/shared/modules/grants/domain/grant";
import { remainingCap, spentPercent } from "@agro/shared/modules/grants/domain/grant-rules";
import { Progress } from "@agro/shared/ui/progress";

// Spent against the cap, in text and bar. The figures are announced politely when a payment lands.
export function GrantProgress({ grant, label }: { grant: MilestoneGrant; label: string }) {
  const percent = spentPercent(grant);
  return (
    <div className="flex flex-col gap-2">
      <Progress value={percent} aria-label={label} aria-valuenow={percent} />
      <p aria-live="polite" className="flex flex-wrap justify-between gap-x-3 text-sm text-muted-foreground">
        <span>
          Gastado <span className="font-semibold tabular-nums text-foreground">{formatMoney(grant.spent, grant.currency)}</span> de{" "}
          <span className="tabular-nums">{formatMoney(grant.capAmount, grant.currency)}</span>
        </span>
        <span>
          {grant.status === "REVOKED" ? "Sigue en tu billetera" : "Disponible"} <span className="font-semibold tabular-nums text-foreground">{formatMoney(remainingCap(grant), grant.currency)}</span>
        </span>
      </p>
    </div>
  );
}
