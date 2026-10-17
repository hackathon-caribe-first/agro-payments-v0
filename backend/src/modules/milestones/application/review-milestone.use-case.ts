import { Injectable } from "@nestjs/common";
import { type Decision, LINE_KIND, LINE_STATUS, type LineKind, review } from "./milestone";
import { ProjectCustody } from "../ports/project-custody";
import { MilestoneStore } from "./milestone-store";
import { PayLineUseCase } from "./pay-line.use-case";
import { assertMilestoneUnlocked } from "./submit-evidence.use-case";

// Jornales first, then the fee, as in the PRD split table.
const RELEASED_ON_APPROVAL: readonly LineKind[] = [LINE_KIND.PRODUCTOR, LINE_KIND.PLATAFORMA];

@Injectable()
export class ReviewMilestoneUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly payLine: PayLineUseCase,
    private readonly custody: ProjectCustody,
  ) {}

  async execute(id: string, decision: Decision, reason: string | null) {
    await assertMilestoneUnlocked(this.store, this.custody, id);
    const reviewed = await this.store.update(id, (m) => review(m, decision, reason, new Date()));
    // RF-20: approval releases the jornales line (when the level has one) and the milestone fee; supplier lines are paid separately.
    // Unfunded: nothing to pay from yet, the operator pays those lines after funding.
    if (decision !== "approved" || !reviewed.fundedAt) return reviewed;
    // Approval with every line already final closed the milestone: nothing to pay, only the grant to revoke (RF-22).
    if (reviewed.closedAt) return this.payLine.closeOut(reviewed);
    let latest = reviewed;
    for (const line of reviewed.lines.filter((l) => RELEASED_ON_APPROVAL.includes(l.kind) && l.status === LINE_STATUS.PENDIENTE)) {
      latest = await this.payLine.execute(id, line.id);
    }
    return latest;
  }
}
