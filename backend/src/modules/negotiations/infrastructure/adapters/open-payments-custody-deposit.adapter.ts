import { randomUUID } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import { minorUnits } from "../../../milestones/infrastructure/adapters/open-payments-payment-gateway.adapter";
import {
  finalizeInteractiveGrant,
  type OpenPayments,
  requestInteractiveOutgoingGrant,
  requestToken,
  withGrantToken,
} from "../../../milestones/infrastructure/adapters/open-payments.client";
import type { FundingCallback } from "../../../milestones/ports/milestone-funding";
import { type Grant, type GrantAccess, GRANT_PURPOSE, GRANT_STATUS } from "../../../milestones/ports/grant-store";
import { withOpTraceContext } from "../../../support/application/op-trace";
import { PAYMENT_KIND, PAYMENT_STEP, quoteDetail, type StepRecorder, stepRecorder } from "../../../support/application/payment-step";
import type { PaymentStepRepository } from "../../../support/ports/payment-step.repository";
import { CustodyDeposit, type DepositOrder, type DepositResult } from "../../ports/custody-deposit";

/** The grant's debitAmount cap: the amount plus 1% (rounded up) for ILP fees and rate drift. The quote, not the cap, decides what is debited. */
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
 * amount, quote on the payer's wallet with that receiver, outgoing payment under the just-finalized grant. Resolves the outgoing
 * payment id (reference) and the incoming payment it pays. `metadata` tags the outgoing payment so it can be found again.
 */
export async function payIntoCustody(
  op: OpenPayments,
  grant: { access: { accessToken: string }; payerWalletAddress: string; debitLimit: number },
  order: CustodyAmount,
  what: string,
  record?: StepRecorder,
  metadata?: Record<string, string>,
): Promise<{ reference: string; incomingPaymentId: string }> {
  const { client, custodyWalletAddress } = op;
  const payer = await client.walletAddress.get({ url: grant.payerWalletAddress });
  const custody = await client.walletAddress.get({ url: custodyWalletAddress });
  const incomingToken = await requestToken(op, custody.authServer, { type: "incoming-payment", actions: ["create", "read"] });
  const incoming = await client.incomingPayment.create(
    { url: custody.resourceServer, accessToken: incomingToken },
    { walletAddress: custody.id, incomingAmount: { value: String(order.amount), assetCode: order.currency, assetScale: order.assetScale } },
  );
  await record?.(PAYMENT_STEP.INCOMING_CREATED, incoming.id);
  const quoteToken = await requestToken(op, payer.authServer, { type: "quote", actions: ["create", "read"] });
  const quote = await client.quote.create({ url: payer.resourceServer, accessToken: quoteToken }, { walletAddress: payer.id, receiver: incoming.id, method: "ilp" });
  await record?.(PAYMENT_STEP.QUOTE_CREATED, quote.id, quoteDetail(quote.debitAmount, quote.receiveAmount));
  const debit = Number(quote.debitAmount?.value ?? 0);
  if (debit > grant.debitLimit) throw new DomainError(`${what} would debit ${debit}, above the approved ${grant.debitLimit}`);
  // The token is fresh from the continue call, so no rotation is needed here.
  const outgoing = await client.outgoingPayment.create(
    { url: payer.resourceServer, accessToken: grant.access.accessToken },
    { walletAddress: payer.id, quoteId: quote.id, ...(metadata && { metadata }) },
  );
  if (outgoing.failed) {
    await record?.(PAYMENT_STEP.FAILED, outgoing.id);
    throw new DomainError(`${what}: the wallet rejected the outgoing payment`);
  }
  await record?.(PAYMENT_STEP.OUTGOING_CREATED, outgoing.id);
  // ponytail: the harvest payment still counts a created outgoing payment as paid; the deposit confirms it (OpenPaymentsCustodyDeposit).
  return { reference: outgoing.id, incomingPaymentId: incoming.id };
}

/** How long complete() waits for a deposit to land before answering "unconfirmed": attempts × intervalMs. */
export type DepositPolling = { attempts: number; intervalMs: number };
const DEFAULT_POLLING: DepositPolling = { attempts: 6, intervalMs: 1500 };
const LIST_PAGE = 100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type PaymentState = "completed" | "failed" | "unconfirmed";

// PRD v3: the buyer moves the agreed project total from their wallet into the custody wallet. start() asks the buyer's wallet for
// one interactive outgoing grant; complete() verifies the redirect, then pays: incoming payment on custody for the exact total,
// quote on the buyer's wallet with that receiver, outgoing payment under the approved grant, and polls it until it lands.
// The buyer wallet comes from the project's purchase contract (RF-04); OP_BUYER_WALLET_ADDRESS is the deployment's fallback.
// Steps are recorded under the negotiation id: a retried deposit keeps the first attempt's row for a step it repeats.
export class OpenPaymentsCustodyDeposit extends CustodyDeposit {
  constructor(
    private readonly op: OpenPayments,
    private readonly buyerWalletAddress: string | null,
    private readonly apiUrl: string,
    private readonly steps?: PaymentStepRepository,
    private readonly polling: DepositPolling = DEFAULT_POLLING,
  ) {
    super();
  }

  private record(order: DepositOrder): StepRecorder {
    return stepRecorder(this.steps, { kind: PAYMENT_KIND.BUYER_DEPOSIT, paymentId: order.negotiationId, projectId: order.projectId });
  }

  // RF-28: every request below is traced under the negotiation and its project.
  private traced<T>(order: DepositOrder, fn: () => Promise<T>) {
    return withOpTraceContext({ projectId: order.projectId, negotiationId: order.negotiationId }, fn);
  }

  start(order: DepositOrder) {
    return this.traced(order, () => this.request(order));
  }

  complete(order: DepositOrder, callback: FundingCallback) {
    return this.traced(order, () => this.pay(order, callback));
  }

  confirm(order: DepositOrder) {
    return this.traced(order, () => this.recheck(order));
  }

  private async request(order: DepositOrder) {
    const buyerWalletAddress = order.buyerWalletAddress ?? this.buyerWalletAddress;
    if (!buyerWalletAddress) throw new DomainError("The project has no purchase contract with a buyer wallet and OP_BUYER_WALLET_ADDRESS is not set: the buyer has no wallet to deposit from");
    const { client, grants, custodyWalletAddress } = this.op;
    const buyer = await client.walletAddress.get({ url: buyerWalletAddress });
    const custody = await client.walletAddress.get({ url: custodyWalletAddress });
    assertWalletAsset(custody, order);

    // The buyer wallet may hold another currency: quote with the project's receive side fixed (the incoming payment's amount) and cap
    // the grant at that debit, in the buyer's own asset. The 1% margin covers the re-quote payIntoCustody takes on complete().
    const incomingToken = await requestToken(this.op, custody.authServer, { type: "incoming-payment", actions: ["create", "read", "complete"] });
    const incoming = await client.incomingPayment.create(
      { url: custody.resourceServer, accessToken: incomingToken },
      { walletAddress: custody.id, incomingAmount: { value: String(order.amount), assetCode: order.currency, assetScale: order.assetScale } },
    );
    const quoteToken = await requestToken(this.op, buyer.authServer, { type: "quote", actions: ["create", "read"] });
    const quote = await client.quote.create({ url: buyer.resourceServer, accessToken: quoteToken }, { walletAddress: buyer.id, receiver: incoming.id, method: "ilp" });
    // This incoming payment only priced the deposit: complete() pays into a fresh one. Close it so it does not stay pending on custody.
    try {
      await client.incomingPayment.complete({ url: incoming.id, accessToken: incomingToken });
    } catch {
      // Best effort: an unclosed pricing payment only stays pending until it expires.
    }
    const limit = depositDebitLimit(Number(quote.debitAmount.value));
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
    await this.record(order)(PAYMENT_STEP.GRANT_REQUESTED, pending.continueUri);
    return { redirectUrl };
  }

  private async pay(order: DepositOrder, callback: FundingCallback): Promise<DepositResult> {
    const what = `Deposit ${order.negotiationId}`;
    const record = this.record(order);
    const grant = await this.op.grants.findLatestForNegotiation(order.negotiationId);
    const active = await finalizeInteractiveGrant(this.op, grant, callback, what);
    await record(PAYMENT_STEP.GRANT_APPROVED, active.access.continueUri);
    const sent = await payIntoCustody(this.op, active, order, what, record, { deposit: order.negotiationId });
    const state = await this.poll(active, sent.reference, sent.incomingPaymentId);
    if (state === "failed") {
      await record(PAYMENT_STEP.FAILED, sent.reference);
      throw new DomainError(`${what} failed at the buyer's wallet: nothing was credited`);
    }
    return this.settled(order, state, sent.reference);
  }

  // The deposit's grant was approved earlier: find the outgoing payment it made (metadata), then poll it again.
  private async recheck(order: DepositOrder): Promise<DepositResult | null> {
    const grant = await this.op.grants.findLatestForNegotiation(order.negotiationId);
    if (grant?.status !== GRANT_STATUS.ACTIVE || !grant.access) return null;
    const active = { ...grant, access: grant.access };
    const payer = await this.op.client.walletAddress.get({ url: grant.payerWalletAddress });
    // ponytail: only the newest page of the buyer's outgoing payments is searched, like the lines' RF-18 lookup but one page.
    const { result } = await withGrantToken(this.op, active, (accessToken) =>
      this.op.client.outgoingPayment.list({ url: payer.resourceServer, accessToken, walletAddress: payer.id }, { first: LIST_PAGE, "wallet-address": payer.id }),
    );
    const sent = result.find((p) => p.metadata?.deposit === order.negotiationId && !p.failed);
    if (!sent) return null;
    const state = await this.poll(active, sent.id, String(sent.receiver));
    if (state === "failed") {
      await this.record(order)(PAYMENT_STEP.FAILED, sent.id);
      return null;
    }
    return this.settled(order, state, sent.id);
  }

  private async settled(order: DepositOrder, state: "completed" | "unconfirmed", reference: string): Promise<DepositResult> {
    // "completed" is recorded by the caller once the custody credit committed.
    if (state === "unconfirmed") await this.record(order)(PAYMENT_STEP.SENT_UNCONFIRMED, reference);
    return { status: state, reference };
  }

  // Landed: the outgoing payment sent its whole debit, or the custody incoming payment completed or received its full amount.
  private async poll(grant: Grant & { access: GrantAccess }, outgoingId: string, incomingId: string): Promise<PaymentState> {
    const { client } = this.op;
    const { authServer } = await client.incomingPayment.getPublic({ url: incomingId });
    const incomingToken = await requestToken(this.op, authServer, { type: "incoming-payment", actions: ["read"] });
    for (let attempt = 0; attempt < this.polling.attempts; attempt++) {
      if (attempt > 0) await sleep(this.polling.intervalMs);
      const outgoing = await withGrantToken(this.op, grant, (accessToken) => client.outgoingPayment.get({ url: outgoingId, accessToken }));
      if (outgoing.failed) return "failed";
      const sent = minorUnits(outgoing.sentAmount);
      const debit = minorUnits(outgoing.debitAmount);
      if (sent !== null && debit !== null && debit > 0 && sent >= debit) return "completed";
      const incoming = await client.incomingPayment.get({ url: incomingId, accessToken: incomingToken });
      const target = incoming.incomingAmount?.value;
      if (incoming.completed || (target !== undefined && BigInt(incoming.receivedAmount.value) >= BigInt(target))) return "completed";
    }
    return "unconfirmed";
  }
}
