import { Injectable } from "@nestjs/common";
import { custodyGate } from "../../projects/application/project";
import { ProjectCustody } from "../ports/project-custody";
import { submitEvidence } from "./milestone";
import { assertUnlocked } from "./milestone-progress";
import { MilestoneStore } from "./milestone-store";

@Injectable()
export class SubmitEvidenceUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly custody: ProjectCustody,
  ) {}

  async execute(id: string, description: string) {
    await assertMilestoneUnlocked(this.store, this.custody, id);
    return this.store.update(id, (m) => submitEvidence(m, description, new Date()));
  }
}

/** RF-05: a project milestone the PRD API shows LOCKED refuses the legacy writes too. Legacy demo milestones pass. */
export async function assertMilestoneUnlocked(store: MilestoneStore, custody: ProjectCustody, id: string): Promise<void> {
  const milestone = await store.get(id);
  if (milestone.projectId === null) return;
  const standing = await custody.standing(milestone.projectId);
  const gate = standing ? custodyGate({ currentStatus: standing.status }) : { custodyFunded: false };
  assertUnlocked(milestone, await store.listProject(milestone.projectId), gate);
}
