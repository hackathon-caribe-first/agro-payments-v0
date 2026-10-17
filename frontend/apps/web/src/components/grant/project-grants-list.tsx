import type { MilestoneGrant } from "@agro/shared/modules/grants/domain/grant";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { GrantStatusBadge } from "./status";

// Read-only list of the investor grants of a project (the producer has no grant page): milestone, status, cap and spent.
export function ProjectGrantsList({ grants, milestoneLabel }: { grants: readonly MilestoneGrant[]; milestoneLabel: (milestoneId: string) => string }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base text-primary">Grants del inversor</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay grants para este proyecto.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {grants.map((g) => (
              <li key={g.id} className="flex min-w-0 flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-semibold">{milestoneLabel(g.milestoneId)}</p>
                  <GrantStatusBadge status={g.status} />
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
                  <dt className="text-muted-foreground">Tope</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatMoney(g.capAmount, g.currency)}</dd>
                  <dt className="text-muted-foreground">Gastado</dt>
                  <dd className="text-right tabular-nums">{formatMoney(g.spent, g.currency)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
