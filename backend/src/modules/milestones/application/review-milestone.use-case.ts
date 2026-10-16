import { Injectable } from "@nestjs/common";
import { type Decision, review } from "./milestone";
import { MilestoneStore } from "./milestone-store";

@Injectable()
export class ReviewMilestoneUseCase {
  constructor(private readonly store: MilestoneStore) {}

  execute(id: string, decision: Decision, reason: string | null) {
    return this.store.update(id, (m) => review(m, decision, reason, new Date()));
  }
}
