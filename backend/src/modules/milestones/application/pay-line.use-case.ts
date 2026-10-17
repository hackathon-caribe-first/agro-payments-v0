import { Injectable, Optional } from "@nestjs/common";
import { DomainError } from "../../../shared/domain-errors";
import { projectOfMilestone } from "../../support/application/op-trace";
import { PAYMENT_KIND, type PaymentTarget, recordGatewayResult } from "../../support/application/payment-step";
import { PaymentStepRepository } from "../../support/ports/payment-step.repository";
import { MilestoneFunding } from "../ports/milestone-funding";
import { PaymentGateway, type LinePaymentResult } from "../ports/payment-gateway";
import { applyLineResult, assertLinePayable, type Milestone } from "./milestone";
import { MilestoneStore } from "./milestone-store";
import { revokeIfClosed } from "./revoke-grant";

/** A milestone line in the payment step timeline: `${milestoneId}:${lineId}`, like the gateway's idempotency key. */
export const lineTarget = (milestoneId: string, lineId: string): PaymentTarget => ({
  kind: PAYMENT_KIND.MILESTONE_LINE,
  paymentId: `${milestoneId}:${lineId}`,
  projectId: projectOfMilestone(milestoneId),
});

@Injectable()
export class PayLineUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly gateway: PaymentGateway,
    private readonly funding: MilestoneFunding,
    @Optional() private readonly steps?: PaymentStepRepository,
  ) {}

  async execute(id: string, lineId: string) {
    const milestone = await this.store.get(id);
    const line = assertLinePayable(milestone, lineId);

    // A gateway failure fails only this line; a DomainError (e.g. a revoked grant) is a refusal, not a failure, and leaves it pendiente.
    // ponytail: fallido is final, retry via the real adapter is deferred.
    const result: LinePaymentResult = await this.gateway
      .pay({
        milestoneId: id,
        lineId,
        walletAddress: line.walletAddress,
        amount: line.amount,
        currency: milestone.currency,
        assetScale: milestone.assetScale,
      })
      .catch((error: unknown) => {
        if (error instanceof DomainError) throw error;
        return { status: "fallido", reference: null };
      });

    const updated = await this.store.update(id, (m) => applyLineResult(m, lineId, result, new Date()));
    await recordGatewayResult(this.steps, lineTarget(id, lineId), result);
    return this.closeOut(updated);
  }

  /** RF-22 after any transition that may have closed the milestone (a payment or an approval). */
  async closeOut(milestone: Milestone): Promise<Milestone> {
    await revokeIfClosed(this.funding, milestone);
    return milestone;
  }
}
