import { Injectable, Optional } from "@nestjs/common";
import { recordGatewayResult } from "../../support/application/payment-step";
import { PaymentStepRepository } from "../../support/ports/payment-step.repository";
import { MilestoneFunding } from "../ports/milestone-funding";
import { PaymentGateway } from "../ports/payment-gateway";
import { applyLineResult, LINE_STATUS } from "./milestone";
import { MilestoneStore } from "./milestone-store";
import { lineTarget } from "./pay-line.use-case";
import { revokeIfClosed } from "./revoke-grant";

// The gateway has no webhooks: queued lines are resolved by polling.
@Injectable()
export class SyncLinesUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly gateway: PaymentGateway,
    private readonly funding: MilestoneFunding,
    @Optional() private readonly steps?: PaymentStepRepository,
  ) {}

  async execute(id: string) {
    const { lines } = await this.store.get(id);
    for (const line of lines) {
      if (line.status !== LINE_STATUS.EN_COLA || !line.reference) continue;
      // Unreachable gateway: the line stays en_cola for the next sync.
      const result = await this.gateway.check(line.reference).catch(() => null);
      if (!result) continue;
      await this.store.update(id, (m) => applyLineResult(m, line.id, result, new Date()));
      await recordGatewayResult(this.steps, lineTarget(id, line.id), result);
    }
    const synced = await this.store.get(id);
    // Also the retry path for a revoke that failed when the milestone closed.
    await revokeIfClosed(this.funding, synced);
    return synced;
  }
}
