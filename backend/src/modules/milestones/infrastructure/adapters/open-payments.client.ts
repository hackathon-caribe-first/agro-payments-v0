import {
  type AuthenticatedClient,
  createAuthenticatedClient,
  isFinalizedGrantWithAccessToken,
  OpenPaymentsClientError,
} from "@interledger/open-payments";
import type { OpenPaymentsEnv } from "../../../../shared/config/env";
import { DomainError } from "../../../../shared/domain-errors";
import { type Grant, type GrantAccess, GRANT_STATUS, type GrantStore } from "../../ports/grant-store";

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
