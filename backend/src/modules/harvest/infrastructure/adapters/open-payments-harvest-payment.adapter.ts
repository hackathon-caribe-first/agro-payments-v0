import { randomUUID } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import { finalizeInteractiveGrant, type OpenPayments, requestInteractiveOutgoingGrant } from "../../../milestones/infrastructure/adapters/open-payments.client";
import type { FundingCallback } from "../../../milestones/ports/milestone-funding";
import { GRANT_PURPOSE, GRANT_STATUS } from "../../../milestones/ports/grant-store";
import { assertWalletAsset, depositDebitLimit, payIntoCustody } from "../../../negotiations/infrastructure/adapters/open-payments-custody-deposit.adapter";
import { withOpTraceContext } from "../../../support/application/op-trace";
import { PAYMENT_KIND, PAYMENT_STEP, stepRecorder } from "../../../support/application/payment-step";
import type { PaymentStepRepository } from "../../../support/ports/payment-step.repository";
import { HarvestPayment, type HarvestOrder } from "../../ports/harvest-payment";

// PRD v3 Fase 3 paso 3 / RF-24: the same buyer → custody mechanics as the project deposit (negotiations), keyed by the project
// (one harvest per project): interactive outgoing grant on the buyer's wallet capped at Q·P_g + 1 % fee headroom, then incoming
// payment on custody, quote and outgoing payment once the buyer approves.
// ponytail: one buyer wallet per deployment (OP_BUYER_WALLET_ADDRESS), like the deposit, until buyers onboard their own (RF-01).
export class OpenPaymentsHarvestPayment extends HarvestPayment {
  constructor(
    private readonly op: OpenPayments,
    private readonly buyerWalletAddress: string | null,
    private readonly apiUrl: string,
    private readonly steps?: PaymentStepRepository,
  ) {
    super();
  }

  // RF-28: traced under the project; the steps are the project's one harvest payment.
  start(order: HarvestOrder) {
    return withOpTraceContext({ projectId: order.projectId }, () => this.request(order));
  }

  complete(order: HarvestOrder, callback: FundingCallback) {
    return withOpTraceContext({ projectId: order.projectId }, () => this.pay(order, callback));
  }

  private record(order: HarvestOrder) {
    return stepRecorder(this.steps, { kind: PAYMENT_KIND.HARVEST_PAYMENT, paymentId: order.projectId, projectId: order.projectId });
  }

  private async request(order: HarvestOrder) {
    if (!this.buyerWalletAddress) throw new DomainError("OP_BUYER_WALLET_ADDRESS is not set: the buyer has no wallet to pay from");
    const { client, grants, custodyWalletAddress } = this.op;
    const buyer = await client.walletAddress.get({ url: this.buyerWalletAddress });
    const custody = await client.walletAddress.get({ url: custodyWalletAddress });
    assertWalletAsset(buyer, order);
    assertWalletAsset(custody, order);
    const limit = depositDebitLimit(order.amount);
    const finishUri = `${this.apiUrl}/api/projects/${encodeURIComponent(order.projectId)}/harvest/payment/callback`;
    const { redirectUrl, pending } = await requestInteractiveOutgoingGrant(this.op, buyer, limit, finishUri);
    // Starting again leaves the older pending grant behind: the callback only ever continues the newest one.
    await grants.save({
      id: randomUUID(),
      purpose: GRANT_PURPOSE.HARVEST_PAYMENT,
      projectId: order.projectId,
      milestoneId: null,
      payerWalletAddress: buyer.id,
      assetCode: buyer.assetCode,
      assetScale: buyer.assetScale,
      debitLimit: limit,
      status: GRANT_STATUS.PENDING,
      pending,
      access: null,
      createdAt: new Date(),
      revokedAt: null,
    });
    await this.record(order)(PAYMENT_STEP.GRANT_REQUESTED, pending.continueUri);
    return { redirectUrl };
  }

  private async pay(order: HarvestOrder, callback: FundingCallback) {
    const what = `Harvest payment ${order.projectId}`;
    const record = this.record(order);
    const active = await finalizeInteractiveGrant(this.op, await this.op.grants.findLatestForHarvest(order.projectId), callback, what);
    await record(PAYMENT_STEP.GRANT_APPROVED, active.access.continueUri);
    const { reference } = await payIntoCustody(this.op, active, order, what, record);
    return { reference };
  }
}
