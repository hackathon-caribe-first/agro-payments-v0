import { Injectable } from "@nestjs/common";
import { type Decision, LINE_KIND, review } from "./milestone";
import { MilestoneStore } from "./milestone-store";
import { PayLineUseCase } from "./pay-line.use-case";

@Injectable()
export class ReviewMilestoneUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly payLine: PayLineUseCase,
  ) {}

  async execute(id: string, decision: Decision, reason: string | null) {
    const reviewed = await this.store.update(id, (m) => review(m, decision, reason, new Date()));
    // Approval releases the producer line; the other lines are paid separately.
    // Unfunded: nothing to pay from yet, the operator pays that line after funding.
    if (decision !== "approved" || !reviewed.fundedAt) return reviewed;
    const producer = reviewed.lines.find((l) => l.kind === LINE_KIND.PRODUCTOR)!;
    return this.payLine.execute(id, producer.id);
  }
}
