import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { isFinalizedGrantWithAccessToken, isPendingGrant } from "@interledger/open-payments";
import { DomainError } from "../../../../shared/domain-errors";
import type { Milestone } from "../../application/milestone";
import { type FundingCallback, MilestoneFunding } from "../../ports/milestone-funding";
import { GRANT_PURPOSE, GRANT_STATUS, type GrantPending } from "../../ports/grant-store";
import type { OpenPayments } from "./open-payments.client";

// GNAP §4.2.3: base64(sha256(clientNonce \n asFinishNonce \n interactRef \n grantEndpoint)).
// Wallets differ on the grant endpoint's trailing slash, so both forms are accepted.
function hashMatches(p: GrantPending, interactRef: string, received: string) {
  const bare = p.authServer.replace(/\/$/, "");
  return [bare, `${bare}/`].some((endpoint) => {
    const expected = createHash("sha256").update(`${p.clientNonce}\n${p.finishNonce}\n${interactRef}\n${endpoint}`).digest();
    const got = Buffer.from(received, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

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
    const clientNonce = randomUUID();
    const grant = await client.grant.request(
      { url: custody.authServer },
      {
        access_token: {
          access: [
            {
              type: "outgoing-payment",
              actions: ["create", "read", "list"],
              identifier: custody.id,
              limits: { debitAmount: { value: String(milestone.amount), assetCode: custody.assetCode, assetScale: custody.assetScale } },
            },
          ],
        },
        // Without `finish` the wallet never redirects back with an interact_ref.
        interact: {
          start: ["redirect"],
          finish: { method: "redirect", uri: `${this.apiUrl}/milestones/${encodeURIComponent(milestone.id)}/funding/callback`, nonce: clientNonce },
        },
      },
    );
    if (!isPendingGrant(grant)) throw new Error("Expected an interactive outgoing-payment grant");
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
      pending: {
        clientNonce,
        finishNonce: grant.interact.finish,
        continueUri: grant.continue.uri,
        continueToken: grant.continue.access_token.value,
        authServer: custody.authServer,
      },
      access: null,
      createdAt: new Date(),
      revokedAt: null,
    });
    return { redirectUrl: grant.interact.redirect };
  }

  async complete(milestoneId: string, { interactRef, hash }: FundingCallback) {
    const { client, grants } = this.op;
    const grant = await grants.findLatestForMilestone(milestoneId);
    const pending = grant?.status === GRANT_STATUS.PENDING ? grant.pending : null;
    if (!grant || !pending) throw new DomainError(`Milestone ${milestoneId} has no funding in progress`);
    // A forged callback must not cancel the real one, so the pending grant survives a bad hash.
    if (!hash || !hashMatches(pending, interactRef, hash)) throw new DomainError(`Funding callback for ${milestoneId} failed hash verification`);
    // Consumed before continuing, so a replayed callback finds nothing to continue.
    await grants.save({ ...grant, pending: null });
    const finalized = await client.grant.continue({ url: pending.continueUri, accessToken: pending.continueToken }, { interact_ref: interactRef });
    if (!isFinalizedGrantWithAccessToken(finalized)) throw new Error(`Outgoing grant for ${milestoneId} was not finalized`);
    // ponytail: the grant and fundedAt are saved separately; a crash in between leaves an active grant on an unfunded milestone, funding again supersedes it.
    await grants.save({
      ...grant,
      status: GRANT_STATUS.ACTIVE,
      pending: null,
      access: {
        accessToken: finalized.access_token.value,
        manageUrl: finalized.access_token.manage,
        continueUri: finalized.continue.uri,
        continueToken: finalized.continue.access_token.value,
      },
    });
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
