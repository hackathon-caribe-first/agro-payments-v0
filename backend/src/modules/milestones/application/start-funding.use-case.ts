import { Injectable } from "@nestjs/common";
import { DomainError } from "../../../shared/domain-errors";
import { MilestoneFunding } from "../ports/milestone-funding";
import { MilestoneStore } from "./milestone-store";

@Injectable()
export class StartFundingUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly funding: MilestoneFunding,
  ) {}

  async execute(id: string) {
    const milestone = await this.store.get(id);
    if (milestone.fundedAt) throw new DomainError(`Milestone ${id} is already funded`);
    return this.funding.start(milestone);
  }
}
