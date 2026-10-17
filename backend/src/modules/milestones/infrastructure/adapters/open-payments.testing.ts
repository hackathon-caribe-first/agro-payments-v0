// Mocked AuthenticatedClient surface for the Open Payments adapter specs: no network.
import { OpenPaymentsClientError } from "@interledger/open-payments";
import { type OpenPayments, type OpenPaymentsClient, OpenPaymentsGrants } from "./open-payments.client";

type Url = { url: string };
type Auth = { url: string; accessToken: string };
type Wallet = { id: string; authServer: string; resourceServer: string; assetCode: string; assetScale: number; publicName?: string };

// Wallet ids live on a different host than their resource servers so specs can prove resourceServer is used.
export const INVESTOR: Wallet = {
  id: "https://ilp.test/investor",
  authServer: "https://auth.test",
  resourceServer: "https://rs.investor.test",
  assetCode: "USD",
  assetScale: 2,
};
export const RECEIVER: Wallet = {
  id: "https://ilp.test/receiver",
  authServer: "https://auth.receiver.test",
  resourceServer: "https://rs.receiver.test",
  assetCode: "USD",
  assetScale: 2,
};

export const authError = (status: number) => new OpenPaymentsClientError("Error making Open Payments request", { description: "unauthorized", status });

export function mockOpenPayments(wallets: Wallet[] = [INVESTOR, RECEIVER]) {
  const calls: string[] = [];
  const log = (call: string) => calls.push(call);
  const byUrl = new Map(wallets.map((w) => [w.id, w]));
  const client = {
    walletAddress: {
      get: vi.fn(async ({ url }: Url) => {
        log(`wallet.get ${url}`);
        const wallet = byUrl.get(url);
        if (!wallet) throw new Error(`unknown wallet ${url}`);
        return wallet;
      }),
    },
    grant: {
      request: vi.fn(async ({ url }: Url, args: { access_token: { access: { type: string }[] }; interact?: unknown }) => {
        const type = args.access_token.access[0].type;
        log(`grant.request ${url} ${type}`);
        const cont = { uri: `${url}/continue/1`, access_token: { value: "continue-token" } };
        if (args.interact) return { interact: { redirect: "https://wallet.test/consent", finish: "as-nonce" }, continue: cont };
        return { access_token: { value: `${type}-token`, manage: `${url}/token/1`, access: [] }, continue: cont };
      }),
      continue: vi.fn(async ({ url }: Auth, _args?: { interact_ref: string }) => {
        log(`grant.continue ${url}`);
        return {
          access_token: { value: "outgoing-token", manage: "https://auth.test/token/out", access: [] },
          continue: { uri: url, access_token: { value: "continue-token-2" } },
        };
      }),
    },
    incomingPayment: {
      create: vi.fn(async ({ url }: Auth, _args: unknown) => {
        log(`incomingPayment.create ${url}`);
        return { id: `${RECEIVER.resourceServer}/incoming-payments/in-1`, walletAddress: RECEIVER.id, completed: false };
      }),
      getPublic: vi.fn(async ({ url }: Url) => {
        log(`incomingPayment.getPublic ${url}`);
        return { authServer: RECEIVER.authServer };
      }),
      get: vi.fn(async ({ url }: Auth) => {
        log(`incomingPayment.get ${url}`);
        return { id: url, completed: false };
      }),
    },
    quote: {
      create: vi.fn(async ({ url }: Auth, _args: unknown) => {
        log(`quote.create ${url}`);
        return { id: `${INVESTOR.resourceServer}/quotes/q-1` };
      }),
    },
    outgoingPayment: {
      create: vi.fn(async ({ url }: Auth, _args: unknown) => {
        log(`outgoingPayment.create ${url}`);
        return { id: `${INVESTOR.resourceServer}/outgoing-payments/out-1`, failed: false };
      }),
      get: vi.fn(async ({ url }: Auth) => {
        log(`outgoingPayment.get ${url}`);
        return { id: url, failed: false };
      }),
    },
    token: {
      rotate: vi.fn(async ({ url }: Auth) => {
        log(`token.rotate ${url}`);
        return { access_token: { value: "rotated-token", manage: "https://auth.test/token/rotated", access: [] } };
      }),
    },
  };
  const grants = new OpenPaymentsGrants();
  const op: OpenPayments = { client: client as unknown as OpenPaymentsClient, grants, investorWalletAddress: INVESTOR.id };
  return { calls, client, grants, op };
}
