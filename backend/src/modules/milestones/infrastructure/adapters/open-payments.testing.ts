// Mocked AuthenticatedClient surface for the Open Payments adapter specs: no network.
import { OpenPaymentsClientError } from "@interledger/open-payments";
import { type Grant, GRANT_PURPOSE, GRANT_STATUS, GrantStore } from "../../ports/grant-store";
import type { OpenPayments, OpenPaymentsClient } from "./open-payments.client";

type Url = { url: string };
type Auth = { url: string; accessToken: string };
type Wallet = { id: string; authServer: string; resourceServer: string; assetCode: string; assetScale: number; publicName?: string };

// Wallet ids live on a different host than their resource servers so specs can prove resourceServer is used.
export const CUSTODY: Wallet = {
  id: "https://ilp.test/custody",
  authServer: "https://auth.test",
  resourceServer: "https://rs.custody.test",
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

// Copies on the way in and out, like a database would: specs cannot mutate stored grants by reference.
export class InMemoryGrantStore extends GrantStore {
  private readonly grants = new Map<string, Grant>();
  async save(grant: Grant) {
    this.grants.set(grant.id, structuredClone(grant));
  }
  async findLatestForMilestone(milestoneId: string) {
    return this.latest((g) => g.purpose === GRANT_PURPOSE.MILESTONE && g.milestoneId === milestoneId);
  }
  async findLatestForNegotiation(negotiationId: string) {
    return this.latest((g) => g.purpose === GRANT_PURPOSE.BUYER_DEPOSIT && g.negotiationId === negotiationId);
  }
  async findLatestForInvestment(investmentId: string) {
    return this.latest((g) => g.purpose === GRANT_PURPOSE.INVESTOR_CAPTURE && g.investmentId === investmentId);
  }
  async findLatestForSettlement(settlementId: string) {
    return this.latest((g) => g.purpose === GRANT_PURPOSE.LIQUIDATION && g.settlementId === settlementId);
  }
  async findLatestForHarvest(projectId: string) {
    return this.latest((g) => g.purpose === GRANT_PURPOSE.HARVEST_PAYMENT && g.projectId === projectId);
  }
  private latest(match: (g: Grant) => boolean) {
    const mine = [...this.grants.values()].filter(match);
    const latest = mine.reduce<Grant | null>((a, g) => (!a || g.createdAt >= a.createdAt ? g : a), null);
    return latest ? structuredClone(latest) : null;
  }
}

/** The access part OpenPaymentsFunding stores after a verified callback on this mock. */
export const GRANT_ACCESS = {
  accessToken: "outgoing-token",
  manageUrl: "https://auth.test/token/out",
  continueUri: "https://auth.test/continue/1",
  continueToken: "continue-token-2",
};

/** An active milestone grant on the custody wallet, as a funded milestone has it. */
export const activeGrant = (overrides: Partial<Grant> = {}): Grant => ({
  id: "g-1",
  purpose: GRANT_PURPOSE.MILESTONE,
  projectId: null,
  milestoneId: "m1",
  payerWalletAddress: CUSTODY.id,
  assetCode: "USD",
  assetScale: 2,
  debitLimit: 10_000,
  status: GRANT_STATUS.ACTIVE,
  pending: null,
  access: { ...GRANT_ACCESS },
  createdAt: new Date("2026-10-16T12:00:00Z"),
  revokedAt: null,
  ...overrides,
});

type Amount = { value: string; assetCode: string; assetScale: number };
export const amount = (value: string): Amount => ({ value, assetCode: "USD", assetScale: 2 });

export const authError = (status: number) => new OpenPaymentsClientError("Error making Open Payments request", { description: "unauthorized", status });

export function mockOpenPayments(wallets: Wallet[] = [CUSTODY, RECEIVER]) {
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
      cancel: vi.fn(async ({ url }: Auth) => {
        log(`grant.cancel ${url}`);
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
        return { id: url, completed: false, receivedAmount: amount("0") };
      }),
    },
    quote: {
      create: vi.fn(async ({ url }: Auth, _args: unknown) => {
        log(`quote.create ${url}`);
        return { id: `${CUSTODY.resourceServer}/quotes/q-1` };
      }),
    },
    outgoingPayment: {
      create: vi.fn(async ({ url }: Auth, _args: unknown) => {
        log(`outgoingPayment.create ${url}`);
        return {
          id: `${CUSTODY.resourceServer}/outgoing-payments/out-1`,
          quoteId: `${CUSTODY.resourceServer}/quotes/q-1`,
          failed: false,
          debitAmount: amount("3010"),
          receiveAmount: amount("3000"),
        } as { id: string; quoteId: string; failed: boolean; debitAmount: Amount; receiveAmount: Amount; grantSpentDebitAmount?: Amount };
      }),
      get: vi.fn(async ({ url }: Auth) => {
        log(`outgoingPayment.get ${url}`);
        return { id: url, quoteId: `${CUSTODY.resourceServer}/quotes/q-1`, failed: false, debitAmount: amount("3010"), receiveAmount: amount("3000") };
      }),
      // Grant debit total; specs override it to model before/after a payment.
      getGrantSpentAmounts: vi.fn(async ({ url }: Auth) => {
        log(`outgoingPayment.getGrantSpentAmounts ${url}`);
        return { spentDebitAmount: null as Amount | null, spentReceiveAmount: null as Amount | null };
      }),
    },
    token: {
      rotate: vi.fn(async ({ url }: Auth) => {
        log(`token.rotate ${url}`);
        return { access_token: { value: "rotated-token", manage: "https://auth.test/token/rotated", access: [] } };
      }),
    },
  };
  const grants = new InMemoryGrantStore();
  const op: OpenPayments = { client: client as unknown as OpenPaymentsClient, grants, custodyWalletAddress: CUSTODY.id };
  return { calls, client, grants, op };
}
