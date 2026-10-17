import { Injectable } from "@nestjs/common";
import { DomainError } from "../../../shared/domain-errors";
import { type FundingCallback, MilestoneFunding } from "../ports/milestone-funding";
import { fund } from "./milestone";
import { MilestoneStore } from "./milestone-store";

@Injectable()
export class CompleteFundingUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly funding: MilestoneFunding,
  ) {}

  async execute(id: string, params: FundingCallback) {
    const milestone = await this.store.get(id);
    if (milestone.fundedAt) throw new DomainError(`Milestone ${id} is already funded`);
    // Only a verified, finalized grant funds the milestone.
    await this.funding.complete(id, params);
    return this.store.update(id, (m) => fund(m, new Date()));
  }
}
