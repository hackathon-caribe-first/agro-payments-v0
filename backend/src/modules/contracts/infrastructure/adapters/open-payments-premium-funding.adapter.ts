import { randomUUID } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import { finalizeInteractiveGrant, type OpenPayments, requestInteractiveOutgoingGrant } from "../../../milestones/infrastructure/adapters/open-payments.client";
import type { FundingCallback } from "../../../milestones/ports/milestone-funding";
import { GRANT_PURPOSE, GRANT_STATUS } from "../../../milestones/ports/grant-store";
import { PremiumFunding, type PremiumOrder } from "../../ports/premium-funding";

// PRD v3 Fase 1 paso 6 (request #13): the fiduciaria approves one interactive outgoing grant on the custody wallet capped at the
// net premium, no interval — the liquidation-grant pattern, keyed by the project. The gateway pays the premium from it.
export class OpenPaymentsPremiumFunding extends PremiumFunding {
  readonly interactive = true;

  constructor(
    private readonly op: OpenPayments,
    private readonly apiUrl: string,
  ) {
    super();
  }

  async start(order: PremiumOrder) {
    const { client, grants, custodyWalletAddress } = this.op;
    const custody = await client.walletAddress.get({ url: custodyWalletAddress });
    if (custody.assetCode !== order.currency || custody.assetScale !== order.assetScale) {
      throw new DomainError(`Custody wallet holds ${custody.assetCode}/${custody.assetScale} but the premium of ${order.projectId} is ${order.currency}/${order.assetScale}`);
    }
    const finishUri = `${this.apiUrl}/api/projects/${encodeURIComponent(order.projectId)}/insurance-policy/premium-grant/callback`;
    const { redirectUrl, pending } = await requestInteractiveOutgoingGrant(this.op, custody, order.amount, finishUri);
    // Starting again leaves the older pending grant behind: the callback only ever continues the newest one.
    await grants.save({
      id: randomUUID(),
      purpose: GRANT_PURPOSE.PREMIUM,
      projectId: order.projectId,
      milestoneId: null,
      payerWalletAddress: custody.id,
      assetCode: custody.assetCode,
      assetScale: custody.assetScale,
      debitLimit: order.amount,
      status: GRANT_STATUS.PENDING,
      pending,
      access: null,
      createdAt: new Date(),
      revokedAt: null,
    });
    return { redirectUrl };
  }

  async complete(projectId: string, callback: FundingCallback) {
    const grant = await this.op.grants.findLatestForPremium(projectId);
    await finalizeInteractiveGrant(this.op, grant, callback, `Premium of project ${projectId}`);
  }

  async ready(projectId: string) {
    const grant = await this.op.grants.findLatestForPremium(projectId);
    return grant?.status === GRANT_STATUS.ACTIVE && grant.access !== null;
  }

  async revoke(projectId: string) {
    const { client, grants } = this.op;
    const grant = await grants.findLatestForPremium(projectId);
    if (grant?.status !== GRANT_STATUS.ACTIVE || !grant.access) return;
    await client.grant.cancel({ url: grant.access.continueUri, accessToken: grant.access.continueToken });
    await grants.save({ ...grant, status: GRANT_STATUS.REVOKED, revokedAt: new Date() });
  }
}
