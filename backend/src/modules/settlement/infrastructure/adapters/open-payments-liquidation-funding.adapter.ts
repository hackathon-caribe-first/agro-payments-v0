import { randomUUID } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import {
  finalizeInteractiveGrant,
  type OpenPayments,
  requestInteractiveOutgoingGrant,
} from "../../../milestones/infrastructure/adapters/open-payments.client";
import type { FundingCallback } from "../../../milestones/ports/milestone-funding";
import { GRANT_PURPOSE, GRANT_STATUS } from "../../../milestones/ports/grant-store";
import { withOpTraceContext } from "../../../support/application/op-trace";
import type { Settlement } from "../../application/settlement";
import { LiquidationFunding } from "../../ports/liquidation-funding";

// PRD v3 Fase 3 paso 5: the fiduciaria approves one interactive outgoing grant on the custody wallet, capped at the sum of the
// cascade's payouts in COP (every payout debits custody in COP, fixed-debit ones included), no interval. Payouts use it by settlement id.
export class OpenPaymentsLiquidationFunding extends LiquidationFunding {
  readonly interactive = true;

  constructor(
    private readonly op: OpenPayments,
    private readonly apiUrl: string,
  ) {
    super();
  }

  // RF-28: the grant's requests are traced under the settlement and its project.
  start(settlement: Settlement) {
    return withOpTraceContext({ settlementId: settlement.id, projectId: settlement.projectId }, () => this.request(settlement));
  }

  complete(settlementId: string, callback: FundingCallback) {
    return withOpTraceContext({ settlementId }, () => this.finalize(settlementId, callback));
  }

  revoke(settlementId: string) {
    return withOpTraceContext({ settlementId }, () => this.cancel(settlementId));
  }

  private async request(settlement: Settlement) {
    const { client, grants, custodyWalletAddress } = this.op;
    const custody = await client.walletAddress.get({ url: custodyWalletAddress });
    if (custody.assetCode !== settlement.currency || custody.assetScale !== settlement.assetScale) {
      throw new DomainError(
        `Custody wallet holds ${custody.assetCode}/${custody.assetScale} but settlement ${settlement.id} is ${settlement.currency}/${settlement.assetScale}`,
      );
    }
    const total = settlement.payouts.reduce((sum, p) => sum + p.amount, 0);
    const finishUri = `${this.apiUrl}/api/settlements/${encodeURIComponent(settlement.id)}/liquidation-grant/callback`;
    const { redirectUrl, pending } = await requestInteractiveOutgoingGrant(this.op, custody, total, finishUri);
    // Starting again leaves the older pending grant behind: the callback only ever continues the newest one.
    await grants.save({
      id: randomUUID(),
      purpose: GRANT_PURPOSE.LIQUIDATION,
      projectId: settlement.projectId,
      milestoneId: null,
      settlementId: settlement.id,
      payerWalletAddress: custody.id,
      assetCode: custody.assetCode,
      assetScale: custody.assetScale,
      debitLimit: total,
      status: GRANT_STATUS.PENDING,
      pending,
      access: null,
      createdAt: new Date(),
      revokedAt: null,
    });
    return { redirectUrl };
  }

  private async finalize(settlementId: string, callback: FundingCallback) {
    const grant = await this.op.grants.findLatestForSettlement(settlementId);
    await finalizeInteractiveGrant(this.op, grant, callback, `Settlement ${settlementId}`);
  }

  async ready(settlementId: string) {
    const grant = await this.op.grants.findLatestForSettlement(settlementId);
    return grant?.status === GRANT_STATUS.ACTIVE && grant.access !== null;
  }

  private async cancel(settlementId: string) {
    const { client, grants } = this.op;
    const grant = await grants.findLatestForSettlement(settlementId);
    if (grant?.status !== GRANT_STATUS.ACTIVE || !grant.access) return;
    await client.grant.cancel({ url: grant.access.continueUri, accessToken: grant.access.continueToken });
    await grants.save({ ...grant, status: GRANT_STATUS.REVOKED, revokedAt: new Date() });
  }
}
