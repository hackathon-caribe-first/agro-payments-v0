import { Injectable } from "@nestjs/common";
import { MilestoneFunding } from "../ports/milestone-funding";
import { assertGrantCanStart } from "./milestone-grant";
import { MilestoneStore } from "./milestone-store";

@Injectable()
export class StartFundingUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly funding: MilestoneFunding,
  ) {}

  async execute(id: string) {
    const milestone = await this.store.get(id);
    // RF-13: the fiduciaria approves one grant at a time per project, N+1 only after N closed (approved and revoked).
    assertGrantCanStart(milestone, milestone.projectId ? await this.store.listProject(milestone.projectId) : []);
    return this.funding.start(milestone);
  }
}
