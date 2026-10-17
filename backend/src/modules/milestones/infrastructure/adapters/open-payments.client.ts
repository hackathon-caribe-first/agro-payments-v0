import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  type AuthenticatedClient,
  createAuthenticatedClient,
  isFinalizedGrantWithAccessToken,
  isPendingGrant,
  OpenPaymentsClientError,
} from "@interledger/open-payments";
import type { OpenPaymentsEnv } from "../../../../shared/config/env";
import { DomainError } from "../../../../shared/domain-errors";
import type { FundingCallback } from "../../ports/milestone-funding";
import { type Grant, type GrantAccess, type GrantPending, GRANT_STATUS, type GrantStore } from "../../ports/grant-store";

/** The slice of the SDK the adapters use, so specs can mock it. */
export type OpenPaymentsClient = Pick<AuthenticatedClient, "walletAddress" | "grant" | "incomingPayment" | "quote" | "outgoingPayment" | "token">;

/** Shared by the funding and payment adapters: one client, one grant store (encrypted in Postgres, see GrantStore). */
export type OpenPayments = {
  client: OpenPaymentsClient;
  grants: GrantStore;
  /** v3 payer of milestone grants; each grant also records its own payerWalletAddress. */
  custodyWalletAddress: string;
};

export async function createOpenPayments(env: OpenPaymentsEnv, grants: GrantStore): Promise<OpenPayments> {
  const client = await createAuthenticatedClient({
    walletAddressUrl: env.clientWalletAddress,
    keyId: env.keyId,
    privateKey: env.privateKeyPath, // the SDK reads a file path
  });
  return { client, grants, custodyWalletAddress: env.custodyWalletAddress };
}

// A revoked grant must not pay: refused as a DomainError (409) before anything reaches the network.
export async function activeOutgoingGrant(grants: GrantStore, milestoneId: string): Promise<Grant & { access: GrantAccess }> {
  const grant = await grants.findLatestForMilestone(milestoneId);
  if (grant?.status === GRANT_STATUS.REVOKED) throw new DomainError(`Milestone ${milestoneId} is closed: its outgoing-payment grant was revoked`);
  if (grant?.status !== GRANT_STATUS.ACTIVE || !grant.access) throw new Error(`Milestone ${milestoneId} has no outgoing-payment grant`);
  return { ...grant, access: grant.access };
}

type AccessItem = NonNullable<Parameters<OpenPaymentsClient["grant"]["request"]>[1]["access_token"]>["access"][number];

// Incoming-payment and quote grants are non-interactive; an interactive answer means the wallet is misconfigured.
export async function requestToken({ client }: OpenPayments, authServer: string, access: AccessItem): Promise<string> {
  const grant = await client.grant.request({ url: authServer }, { access_token: { access: [access] } });
  if (!isFinalizedGrantWithAccessToken(grant)) throw new Error(`Expected a non-interactive ${access.type} grant from ${authServer}`);
  return grant.access_token.value;
}

const isAuthError = (error: unknown) => error instanceof OpenPaymentsClientError && (error.status === 401 || error.status === 403);

// Calls `use` with the milestone's outgoing token; on 401/403 rotates it once through the manage URL and retries once.
export async function withOutgoingToken<T>({ client, grants }: OpenPayments, milestoneId: string, use: (accessToken: string) => Promise<T>) {
  const grant = await activeOutgoingGrant(grants, milestoneId);
  try {
    return await use(grant.access.accessToken);
  } catch (error) {
    if (!isAuthError(error)) throw error;
    const { access_token } = await client.token.rotate({ url: grant.access.manageUrl, accessToken: grant.access.accessToken });
    await grants.save({ ...grant, access: { ...grant.access, accessToken: access_token.value, manageUrl: access_token.manage } });
    return use(access_token.value);
  }
}

// ---- interactive outgoing-payment grants (milestone funding, buyer deposit) ----

// GNAP §4.2.3: base64(sha256(clientNonce \n asFinishNonce \n interactRef \n grantEndpoint)).
// Wallets differ on the grant endpoint's trailing slash, so both forms are accepted.
export function gnapHashMatches(p: GrantPending, interactRef: string, received: string) {
  const bare = p.authServer.replace(/\/$/, "");
  return [bare, `${bare}/`].some((endpoint) => {
    const expected = createHash("sha256").update(`${p.clientNonce}\n${p.finishNonce}\n${interactRef}\n${endpoint}`).digest();
    const got = Buffer.from(received, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

type PayerWallet = { id: string; authServer: string; assetCode: string; assetScale: number };

/** Asks the payer's wallet for an interactive outgoing grant capped at debitLimit (minor units, no interval) that finishes on finishUri. */
export async function requestInteractiveOutgoingGrant(
  { client }: OpenPayments,
  payer: PayerWallet,
  debitLimit: number,
  finishUri: string,
): Promise<{ redirectUrl: string; pending: GrantPending }> {
  const clientNonce = randomUUID();
  const grant = await client.grant.request(
    { url: payer.authServer },
    {
      access_token: {
        access: [
          {
            type: "outgoing-payment",
            actions: ["create", "read", "list"],
            identifier: payer.id,
            limits: { debitAmount: { value: String(debitLimit), assetCode: payer.assetCode, assetScale: payer.assetScale } },
          },
        ],
      },
      // Without `finish` the wallet never redirects back with an interact_ref.
      interact: { start: ["redirect"], finish: { method: "redirect", uri: finishUri, nonce: clientNonce } },
    },
  );
  if (!isPendingGrant(grant)) throw new Error("Expected an interactive outgoing-payment grant");
  return {
    redirectUrl: grant.interact.redirect,
    pending: {
      clientNonce,
      finishNonce: grant.interact.finish,
      continueUri: grant.continue.uri,
      continueToken: grant.continue.access_token.value,
      authServer: payer.authServer,
    },
  };
}

/** Verifies the wallet redirect against the pending grant, continues it and stores it active. `what` names it in errors. */
export async function finalizeInteractiveGrant(
  { client, grants }: OpenPayments,
  grant: Grant | null,
  { interactRef, hash }: FundingCallback,
  what: string,
): Promise<Grant & { access: GrantAccess }> {
  const pending = grant?.status === GRANT_STATUS.PENDING ? grant.pending : null;
  if (!grant || !pending) throw new DomainError(`${what} has no grant in progress`);
  // A forged callback must not cancel the real one, so the pending grant survives a bad hash.
  if (!hash || !gnapHashMatches(pending, interactRef, hash)) throw new DomainError(`Callback for ${what} failed hash verification`);
  // Consumed before continuing, so a replayed callback finds nothing to continue.
  await grants.save({ ...grant, pending: null });
  const finalized = await client.grant.continue({ url: pending.continueUri, accessToken: pending.continueToken }, { interact_ref: interactRef });
  if (!isFinalizedGrantWithAccessToken(finalized)) throw new Error(`Outgoing grant for ${what} was not finalized`);
  const active = {
    ...grant,
    status: GRANT_STATUS.ACTIVE,
    pending: null,
    access: {
      accessToken: finalized.access_token.value,
      manageUrl: finalized.access_token.manage,
      continueUri: finalized.continue.uri,
      continueToken: finalized.continue.access_token.value,
    },
  };
  await grants.save(active);
  return active;
}
