import { randomUUID } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import type { Milestone } from "../../application/milestone";
import { type FundingCallback, MilestoneFunding } from "../../ports/milestone-funding";
import { GRANT_PURPOSE, GRANT_STATUS } from "../../ports/grant-store";
import { finalizeInteractiveGrant, type OpenPayments, requestInteractiveOutgoingGrant } from "./open-payments.client";

// v3: the fiduciaria approves one interactive outgoing-payment grant per milestone on the custody wallet,
// capped at the milestone budget with no interval; every line is paid custody → beneficiary from it.
export class OpenPaymentsFunding extends MilestoneFunding {
  constructor(
    private readonly op: OpenPayments,
    private readonly apiUrl: string,
  ) {
    super();
  }

  async start(milestone: Milestone) {
    const { client, grants, custodyWalletAddress } = this.op;
    const custody = await client.walletAddress.get({ url: custodyWalletAddress });
    if (custody.assetCode !== milestone.currency || custody.assetScale !== milestone.assetScale) {
      throw new DomainError(
        `Custody wallet holds ${custody.assetCode}/${custody.assetScale} but milestone ${milestone.id} is ${milestone.currency}/${milestone.assetScale}`,
      );
    }
    const finishUri = `${this.apiUrl}/milestones/${encodeURIComponent(milestone.id)}/funding/callback`;
    const { redirectUrl, pending } = await requestInteractiveOutgoingGrant(this.op, custody, milestone.amount, finishUri);
    // Starting again leaves the older pending grant behind: the callback only ever continues the newest one.
    await grants.save({
      id: randomUUID(),
      purpose: GRANT_PURPOSE.MILESTONE,
      projectId: null,
      milestoneId: milestone.id,
      payerWalletAddress: custody.id,
      assetCode: custody.assetCode,
      assetScale: custody.assetScale,
      debitLimit: milestone.amount,
      status: GRANT_STATUS.PENDING,
      pending,
      access: null,
      createdAt: new Date(),
      revokedAt: null,
    });
    return { redirectUrl };
  }

  async complete(milestoneId: string, callback: FundingCallback) {
    const grant = await this.op.grants.findLatestForMilestone(milestoneId);
    // ponytail: the grant and fundedAt are saved separately; a crash in between leaves an active grant on an unfunded milestone, funding again supersedes it.
    await finalizeInteractiveGrant(this.op, grant, callback, `Milestone ${milestoneId}`);
  }

  // RF-22: the continue URI and token cancel the whole grant at the custody wallet's auth server.
  async revoke(milestoneId: string) {
    const { client, grants } = this.op;
    const grant = await grants.findLatestForMilestone(milestoneId);
    if (grant?.status !== GRANT_STATUS.ACTIVE || !grant.access) return;
    await client.grant.cancel({ url: grant.access.continueUri, accessToken: grant.access.continueToken });
    await grants.save({ ...grant, status: GRANT_STATUS.REVOKED, revokedAt: new Date() });
  }
}
