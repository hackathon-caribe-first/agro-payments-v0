import { randomUUID } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import type { Milestone } from "../../application/milestone";
import { MilestoneFunding, type FundingCallback } from "../../ports/milestone-funding";

// ponytail: no wallet. start() points the browser straight at our own callback, so the same redirect flow works offline.
export class SimulatedMilestoneFunding extends MilestoneFunding {
  constructor(private readonly apiUrl: string) {
    super();
  }

  // The callback is unauthenticated, so only the interact_ref we issued (once) may finalize funding.
  private readonly pending = new Map<string, string>();

  async start(milestone: Milestone) {
    const interactRef = `SIM-${randomUUID().slice(0, 8).toUpperCase()}`;
    this.pending.set(milestone.id, interactRef);
    return { redirectUrl: `${this.apiUrl}/milestones/${encodeURIComponent(milestone.id)}/funding/callback?interact_ref=${interactRef}&hash=simulated` };
  }

  async complete(milestoneId: string, { interactRef }: FundingCallback) {
    if (this.pending.get(milestoneId) !== interactRef) throw new DomainError(`No pending funding for ${milestoneId} with that interact_ref`);
    this.pending.delete(milestoneId);
  }

  // RF-22 no-op: a simulated milestone has no grant to cancel.
  async revoke(_milestoneId: string) {}
}
