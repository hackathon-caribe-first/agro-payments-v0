import { randomUUID } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import {
  finalizeInteractiveGrant,
  type OpenPayments,
  requestInteractiveOutgoingGrant,
  requestToken,
} from "../../../milestones/infrastructure/adapters/open-payments.client";
import type { FundingCallback } from "../../../milestones/ports/milestone-funding";
import { GRANT_PURPOSE, GRANT_STATUS } from "../../../milestones/ports/grant-store";
import { CustodyDeposit, type DepositOrder } from "../../ports/custody-deposit";

/** The grant's debitAmount cap: the agreed total plus 1% (rounded up) for ILP fees. The quote, not the cap, decides what is debited. */
export const depositDebitLimit = (amount: number) => amount + Math.ceil(amount / 100);

type Wallet = { id: string; assetCode: string; assetScale: number };
type CustodyAmount = { amount: number; currency: string; assetScale: number };

// ponytail: no FX, like the milestone lines.
export function assertWalletAsset(wallet: Wallet, order: CustodyAmount) {
  if (wallet.assetCode !== order.currency || wallet.assetScale !== order.assetScale) {
    throw new DomainError(`Wallet ${wallet.id} holds ${wallet.assetCode}/${wallet.assetScale} but the payment is ${order.currency}/${order.assetScale}`);
  }
}

/**
 * The payer → custody move shared by the buyer's deposit and the harvest payment (RF-24): incoming payment on custody for the exact
 * amount, quote on the payer's wallet with that receiver, outgoing payment under the just-finalized grant. Resolves the outgoing payment id.
 */
export async function payIntoCustody(
  op: OpenPayments,
  grant: { access: { accessToken: string }; payerWalletAddress: string; debitLimit: number },
  order: CustodyAmount,
  what: string,
): Promise<{ reference: string }> {
  const { client, custodyWalletAddress } = op;
  const payer = await client.walletAddress.get({ url: grant.payerWalletAddress });
  const custody = await client.walletAddress.get({ url: custodyWalletAddress });
  const incomingToken = await requestToken(op, custody.authServer, { type: "incoming-payment", actions: ["create", "read"] });
  const incoming = await client.incomingPayment.create(
    { url: custody.resourceServer, accessToken: incomingToken },
    { walletAddress: custody.id, incomingAmount: { value: String(order.amount), assetCode: order.currency, assetScale: order.assetScale } },
  );
  const quoteToken = await requestToken(op, payer.authServer, { type: "quote", actions: ["create", "read"] });
  const quote = await client.quote.create({ url: payer.resourceServer, accessToken: quoteToken }, { walletAddress: payer.id, receiver: incoming.id, method: "ilp" });
  const debit = Number(quote.debitAmount?.value ?? 0);
  if (debit > grant.debitLimit) throw new DomainError(`${what} would debit ${debit}, above the approved ${grant.debitLimit}`);
  // The token is fresh from the continue call, so no rotation is needed here.
  const outgoing = await client.outgoingPayment.create({ url: payer.resourceServer, accessToken: grant.access.accessToken }, { walletAddress: payer.id, quoteId: quote.id });
  // ponytail: a created outgoing payment counts as paid; confirm by polling the incoming payment's completion later.
  return { reference: outgoing.id };
}

// PRD v3: the buyer moves the agreed project total from their wallet into the custody wallet. start() asks the buyer's wallet for
// one interactive outgoing grant; complete() verifies the redirect, then pays: incoming payment on custody for the exact total,
// quote on the buyer's wallet with that receiver, outgoing payment under the approved grant.
// ponytail: one buyer wallet per deployment (OP_BUYER_WALLET_ADDRESS) until buyers onboard their own (RF-01).
export class OpenPaymentsCustodyDeposit extends CustodyDeposit {
  constructor(
    private readonly op: OpenPayments,
    private readonly buyerWalletAddress: string | null,
    private readonly apiUrl: string,
  ) {
    super();
  }

  async start(order: DepositOrder) {
    if (!this.buyerWalletAddress) throw new DomainError("OP_BUYER_WALLET_ADDRESS is not set: the buyer has no wallet to deposit from");
    const { client, grants, custodyWalletAddress } = this.op;
    const buyer = await client.walletAddress.get({ url: this.buyerWalletAddress });
    const custody = await client.walletAddress.get({ url: custodyWalletAddress });
    assertWalletAsset(buyer, order);
    assertWalletAsset(custody, order);

    const limit = depositDebitLimit(order.amount);
    const finishUri = `${this.apiUrl}/api/negotiations/${encodeURIComponent(order.negotiationId)}/deposit/callback`;
    const { redirectUrl, pending } = await requestInteractiveOutgoingGrant(this.op, buyer, limit, finishUri);
    // Starting again leaves the older pending grant behind: the callback only ever continues the newest one.
    await grants.save({
      id: randomUUID(),
      purpose: GRANT_PURPOSE.BUYER_DEPOSIT,
      projectId: order.projectId,
      milestoneId: null,
      negotiationId: order.negotiationId,
      payerWalletAddress: buyer.id,
      assetCode: buyer.assetCode,
      assetScale: buyer.assetScale,
      debitLimit: limit,
      status: GRANT_STATUS.PENDING,
      pending,
      access: null,
      createdAt: new Date(),
      revokedAt: null,
    });
    return { redirectUrl };
  }

  async complete(order: DepositOrder, callback: FundingCallback) {
    const grant = await this.op.grants.findLatestForNegotiation(order.negotiationId);
    const active = await finalizeInteractiveGrant(this.op, grant, callback, `Deposit ${order.negotiationId}`);
    return payIntoCustody(this.op, active, order, `Deposit ${order.negotiationId}`);
  }
}
