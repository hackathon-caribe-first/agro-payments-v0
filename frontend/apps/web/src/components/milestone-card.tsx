import { Children } from "react";
import type { Milestone } from "@agro/shared/api/client";
import { formatMoney, milestoneState } from "@agro/shared/modules/milestones/milestone-state";
import { StatusBadge } from "@agro/shared/ui/status-badge";

export function MilestoneCard({ milestone, children }: { milestone: Milestone; children?: React.ReactNode }) {
  return (
    <li className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg text-primary">{milestone.title}</h2>
          <p className="text-muted-foreground tabular-nums">{formatMoney(milestone.amount, milestone.currency)}</p>
        </div>
        <StatusBadge {...milestoneState(milestone)} />
      </div>
      {/* Children.toArray drops false/null, so conditional actions do not leave an empty section */}
      {Children.toArray(children).length > 0 && <div className="mt-4 border-t pt-4">{children}</div>}
    </li>
  );
}

export function MilestoneList({ children }: { children: React.ReactNode }) {
  return <ul className="mt-6 flex flex-col gap-4">{children}</ul>;
}
