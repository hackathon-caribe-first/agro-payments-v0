import { Children } from "react";
import type { Milestone } from "@agro/shared/api/client";
import { formatMoney, milestoneState } from "@agro/shared/modules/milestones/milestone-state";
import { StatusBadge } from "@agro/shared/ui/status-badge";

// `project` names the project the milestone belongs to, so repeated milestone titles stay distinguishable.
export function MilestoneCard({ milestone, project, children }: { milestone: Milestone; project?: string; children?: React.ReactNode }) {
  return (
    <li className="min-w-0 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {project && <p className="text-sm text-muted-foreground">{project}</p>}
          <h2 className="text-lg text-primary">{milestone.title}</h2>
          <p className="text-muted-foreground tabular-nums">{formatMoney(milestone.amount, milestone.currency, milestone.assetScale)}</p>
        </div>
        <StatusBadge {...milestoneState(milestone)} />
      </div>
      {/* Children.toArray drops false/null, so conditional actions do not leave an empty section */}
      {Children.toArray(children).length > 0 && <div className="mt-4 border-t pt-4">{children}</div>}
    </li>
  );
}

export function MilestoneList({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4">{children}</ul>;
}
