import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { isFinalizedGrantWithAccessToken, isPendingGrant } from "@interledger/open-payments";
import { DomainError } from "../../../../shared/domain-errors";
import type { Milestone } from "../../application/milestone";
import { type FundingCallback, MilestoneFunding } from "../../ports/milestone-funding";
import type { OpenPayments, PendingFunding } from "./open-payments.client";

// GNAP §4.2.3: base64(sha256(clientNonce \n asFinishNonce \n interactRef \n grantEndpoint)).
// Wallets differ on the grant endpoint's trailing slash, so both forms are accepted.
function hashMatches(p: PendingFunding, interactRef: string, received: string) {
  const bare = p.authServer.replace(/\/$/, "");
  return [bare, `${bare}/`].some((endpoint) => {
    const expected = createHash("sha256").update(`${p.clientNonce}\n${p.finishNonce}\n${interactRef}\n${endpoint}`).digest();
    const got = Buffer.from(received, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

// One interactive outgoing-payment grant per milestone, capped at its amount with no interval.
export class OpenPaymentsFunding extends MilestoneFunding {
  constructor(
    private readonly op: OpenPayments,
    private readonly apiUrl: string,
  ) {
    super();
  }

  async start(milestone: Milestone) {
    const { client, grants, investorWalletAddress } = this.op;
    const investor = await client.walletAddress.get({ url: investorWalletAddress });
    if (investor.assetCode !== milestone.currency || investor.assetScale !== milestone.assetScale) {
      throw new DomainError(
        `Investor wallet holds ${investor.assetCode}/${investor.assetScale} but milestone ${milestone.id} is ${milestone.currency}/${milestone.assetScale}`,
      );
    }
    const clientNonce = randomUUID();
    const grant = await client.grant.request(
      { url: investor.authServer },
      {
        access_token: {
          access: [
            {
              type: "outgoing-payment",
              actions: ["create", "read"],
              identifier: investor.id,
              limits: { debitAmount: { value: String(milestone.amount), assetCode: investor.assetCode, assetScale: investor.assetScale } },
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
    grants.pending.set(milestone.id, {
      continueUri: grant.continue.uri,
      continueToken: grant.continue.access_token.value,
      clientNonce,
      finishNonce: grant.interact.finish,
      authServer: investor.authServer,
    });
    return { redirectUrl: grant.interact.redirect };
  }

  async complete(milestoneId: string, { interactRef, hash }: FundingCallback) {
    const { client, grants } = this.op;
    const pending = grants.pending.get(milestoneId);
    if (!pending) throw new DomainError(`Milestone ${milestoneId} has no funding in progress`);
    // A forged callback must not cancel the real one, so the pending grant survives a bad hash.
    if (!hash || !hashMatches(pending, interactRef, hash)) throw new DomainError(`Funding callback for ${milestoneId} failed hash verification`);
    grants.pending.delete(milestoneId);
    const grant = await client.grant.continue(
      { url: pending.continueUri, accessToken: pending.continueToken },
      { interact_ref: interactRef },
    );
    if (!isFinalizedGrantWithAccessToken(grant)) throw new Error(`Outgoing grant for ${milestoneId} was not finalized`);
    grants.outgoing.set(milestoneId, { accessToken: grant.access_token.value, manageUrl: grant.access_token.manage });
  }
}
