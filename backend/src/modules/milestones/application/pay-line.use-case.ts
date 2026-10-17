import { Injectable } from "@nestjs/common";
import { PaymentGateway, type LinePaymentResult } from "../ports/payment-gateway";
import { applyLineResult, assertLinePayable } from "./milestone";
import { MilestoneStore } from "./milestone-store";

@Injectable()
export class PayLineUseCase {
  constructor(
    private readonly store: MilestoneStore,
    private readonly gateway: PaymentGateway,
  ) {}

  async execute(id: string, lineId: string) {
    const milestone = await this.store.get(id);
    const line = assertLinePayable(milestone, lineId);

    // A gateway failure fails only this line. ponytail: fallido is final, retry via the real adapter is deferred.
    const result: LinePaymentResult = await this.gateway
      .pay({
        milestoneId: id,
        lineId,
        walletAddress: line.walletAddress,
        amount: line.amount,
        currency: milestone.currency,
        assetScale: milestone.assetScale,
      })
      .catch(() => ({ status: "fallido", reference: null }));

    return this.store.update(id, (m) => applyLineResult(m, lineId, result, new Date()));
  }
}
