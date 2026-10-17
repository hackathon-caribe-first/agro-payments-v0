import { Injectable } from "@nestjs/common";
import { MilestoneFunding } from "../ports/milestone-funding";
import { ProjectCustody } from "../ports/project-custody";
import { assertCustodyCovers, assertGrantCanStart } from "./milestone-grant";
import { MilestoneStore } from "./milestone-store";

@Injectable()
export class StartFundingUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly funding: MilestoneFunding,
    private readonly custody: ProjectCustody,
  ) {}

  async execute(id: string) {
    const milestone = await this.store.get(id);
    // RF-13: the fiduciaria approves one grant at a time per project, N+1 only after N closed (approved and revoked).
    assertGrantCanStart(milestone, milestone.projectId ? await this.store.listProject(milestone.projectId) : []);
    // RF-05: never against a project whose custody is not funded or cannot cover the milestone (no overdraft).
    if (milestone.projectId) assertCustodyCovers(milestone, await this.custody.standing(milestone.projectId));
    return this.funding.start(milestone);
  }
}
