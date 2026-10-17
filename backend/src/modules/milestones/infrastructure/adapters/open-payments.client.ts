import {
  type AuthenticatedClient,
  createAuthenticatedClient,
  isFinalizedGrantWithAccessToken,
  OpenPaymentsClientError,
} from "@interledger/open-payments";
import type { OpenPaymentsEnv } from "../../../../shared/config/env";

/** The slice of the SDK the adapters use, so specs can mock it. */
export type OpenPaymentsClient = Pick<AuthenticatedClient, "walletAddress" | "grant" | "incomingPayment" | "quote" | "outgoingPayment" | "token">;

/** Interactive grant waiting for the investor's consent. */
export type PendingFunding = { continueUri: string; continueToken: string; clientNonce: string; finishNonce: string; authServer: string };

/** Finalized outgoing-payment grant of one milestone. */
export type OutgoingGrant = { accessToken: string; manageUrl: string };

// ponytail: in-memory grant store, lost on restart like the demo milestones; encrypted Postgres storage deferred.
// Tokens live only here: never log them or return them through the API.
export class OpenPaymentsGrants {
  readonly pending = new Map<string, PendingFunding>();
  readonly outgoing = new Map<string, OutgoingGrant>();
}

/** Shared by the funding and payment adapters: one client, one grant store. */
export type OpenPayments = { client: OpenPaymentsClient; grants: OpenPaymentsGrants; investorWalletAddress: string };

export async function createOpenPayments(env: OpenPaymentsEnv): Promise<OpenPayments> {
  const client = await createAuthenticatedClient({
    walletAddressUrl: env.clientWalletAddress,
    keyId: env.keyId,
    privateKey: env.privateKeyPath, // the SDK reads a file path
  });
  return { client, grants: new OpenPaymentsGrants(), investorWalletAddress: env.investorWalletAddress };
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
  const grant = grants.outgoing.get(milestoneId);
  if (!grant) throw new Error(`Milestone ${milestoneId} has no outgoing-payment grant`);
  try {
    return await use(grant.accessToken);
  } catch (error) {
    if (!isAuthError(error)) throw error;
    const { access_token } = await client.token.rotate({ url: grant.manageUrl, accessToken: grant.accessToken });
    grants.outgoing.set(milestoneId, { accessToken: access_token.value, manageUrl: access_token.manage });
    return use(access_token.value);
  }
}
