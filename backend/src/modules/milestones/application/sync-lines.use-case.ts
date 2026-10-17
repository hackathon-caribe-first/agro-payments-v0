import { Injectable } from "@nestjs/common";
import { MilestoneFunding } from "../ports/milestone-funding";
import { PaymentGateway } from "../ports/payment-gateway";
import { applyLineResult, LINE_STATUS } from "./milestone";
import { MilestoneStore } from "./milestone-store";
import { revokeIfClosed } from "./revoke-grant";

// The gateway has no webhooks: queued lines are resolved by polling.
@Injectable()
export class SyncLinesUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly gateway: PaymentGateway,
    private readonly funding: MilestoneFunding,
  ) {}

  async execute(id: string) {
    const { lines } = await this.store.get(id);
    for (const line of lines) {
      if (line.status !== LINE_STATUS.EN_COLA || !line.reference) continue;
      // Unreachable gateway: the line stays en_cola for the next sync.
      const result = await this.gateway.check(line.reference).catch(() => null);
      if (result) await this.store.update(id, (m) => applyLineResult(m, line.id, result, new Date()));
    }
    const synced = await this.store.get(id);
    // Also the retry path for a revoke that failed when the milestone closed.
    await revokeIfClosed(this.funding, synced);
    return synced;
  }
}
