import { Logger } from "@nestjs/common";
import { DomainError } from "../../../../shared/domain-errors";
import type { ReceiptAmount } from "../../application/milestone";
import { type GrantScope, type LinePaymentRequest, type LinePaymentResult, PaymentGateway } from "../../ports/payment-gateway";
import { activeOutgoingGrant, type OpenPayments, requestToken, withOutgoingToken } from "./open-payments.client";

// Reference = grant key + incoming + outgoing payment URLs, so check() can read both and pick the right grant.
// The key is the milestone id, or `liquidation:<settlementId>` for settlement payouts.
const SEPARATOR = " ";
const LIQUIDATION_PREFIX = "liquidation:";
const toReference = (milestoneId: string, scope: GrantScope, incomingId: string, outgoingId: string) =>
  [scope === "liquidation" ? `${LIQUIDATION_PREFIX}${milestoneId}` : milestoneId, incomingId, outgoingId].join(SEPARATOR);
function fromReference(reference: string) {
  const [key, incomingId, outgoingId] = reference.split(SEPARATOR);
  if (!key || !incomingId || !outgoingId) throw new Error(`Not an Open Payments reference: ${reference}`);
  const scope: GrantScope = key.startsWith(LIQUIDATION_PREFIX) ? "liquidation" : "milestone";
  return { milestoneId: scope === "liquidation" ? key.slice(LIQUIDATION_PREFIX.length) : key, scope, incomingId, outgoingId };
}

type OpAmount = { value: string; assetCode: string; assetScale: number };

// Open Payments amounts are decimal strings in minor units; anything that does not fit a safe integer is left out of the receipt.
function minorUnits(amount: { value: string } | null | undefined): number | null {
  if (!amount || !/^\d+$/.test(amount.value)) return null;
  const value = Number(amount.value);
  return Number.isSafeInteger(value) ? value : null;
}

function receiptAmount(amount: OpAmount | null | undefined): ReceiptAmount | null {
  const value = minorUnits(amount);
  return amount && value !== null ? { value, assetCode: amount.assetCode, assetScale: amount.assetScale } : null;
}

// Pays each line from the milestone's grant (v3: custody → beneficiary): incoming payment on the beneficiary,
// quote and outgoing payment on the grant's payer wallet.
export class OpenPaymentsGateway extends PaymentGateway {
  private readonly logger = new Logger(OpenPaymentsGateway.name);
  // Idempotency by `${milestoneId}:${lineId}`: a line that already has a payment never gets a second one.
  // ponytail: process memory; across restarts the persisted line status (not pendiente) is what blocks a second payment.
  private readonly paid = new Map<string, LinePaymentResult>();

  constructor(private readonly op: OpenPayments) {
    super();
  }

  async pay(request: LinePaymentRequest): Promise<LinePaymentResult> {
    const key = `${request.milestoneId}:${request.lineId}`;
    const existing = this.paid.get(key);
    if (existing) return existing;
    const result = await this.send(request);
    if (result.reference) this.paid.set(key, result);
    return result;
  }

  private async send(request: LinePaymentRequest): Promise<LinePaymentResult> {
    // ponytail: a fixed debit needs an incoming payment without incomingAmount, a quote with debitAmount and a check() that
    // settles on the outgoing payment's sentAmount (such an incoming payment never completes on its own), none of which exist yet;
    // the liquidation grant on custody (PRD v3 Fase 3 paso 5) does (grantScope "liquidation"). Refused (409) until then; the simulated gateway supports it.
    if (request.fixedDebitAmount) throw new DomainError("Fixed-debit (cross-currency) payouts are not supported in open-payments mode yet");
    const { client } = this.op;
    const scope = request.grantScope ?? "milestone";
    const grant = await activeOutgoingGrant(this.op.grants, request.milestoneId, scope);

    const receiver = await client.walletAddress.get({ url: request.walletAddress });
    // ponytail: no FX. A beneficiary wallet in another asset fails its line.
    if (receiver.assetCode !== request.currency || receiver.assetScale !== request.assetScale) {
      this.logger.warn(
        `Line ${request.lineId} failed: wallet ${receiver.id} holds ${receiver.assetCode}/${receiver.assetScale}, milestone pays ${request.currency}/${request.assetScale} and FX is not supported`,
      );
      return { status: "fallido", reference: null };
    }
    const payer = await client.walletAddress.get({ url: grant.payerWalletAddress });
    // RF-17: read what the grant already spent before creating or quoting anything; a line it cannot cover is refused (409, stays pendiente).
    // Unreadable (null): the wallet still enforces the debit limit on the outgoing payment.
    const spent = await this.grantSpent(request.milestoneId, payer.resourceServer, scope);
    if (spent !== null && spent + request.amount > grant.debitLimit) {
      throw new DomainError(`Line ${request.lineId} (${request.amount}) exceeds what the grant has left (${grant.debitLimit - spent} of ${grant.debitLimit})`);
    }

    const incomingToken = await requestToken(this.op, receiver.authServer, { type: "incoming-payment", actions: ["create", "read"] });
    const incoming = await client.incomingPayment.create(
      { url: receiver.resourceServer, accessToken: incomingToken },
      { walletAddress: receiver.id, incomingAmount: { value: String(request.amount), assetCode: receiver.assetCode, assetScale: receiver.assetScale } },
    );

    const quoteToken = await requestToken(this.op, payer.authServer, { type: "quote", actions: ["create", "read"] });
    const quote = await client.quote.create(
      { url: payer.resourceServer, accessToken: quoteToken },
      { walletAddress: payer.id, receiver: incoming.id, method: "ilp" },
    );

    const outgoing = await withOutgoingToken(
      this.op,
      request.milestoneId,
      (accessToken) => client.outgoingPayment.create({ url: payer.resourceServer, accessToken }, { walletAddress: payer.id, quoteId: quote.id }),
      scope,
    );
    // Settlement is asynchronous: check() resolves it, adds the received amount and re-reads the grant total.
    return {
      status: "en_cola",
      reference: toReference(request.milestoneId, scope, incoming.id, outgoing.id),
      receipt: {
        incomingPaymentId: incoming.id,
        outgoingPaymentId: outgoing.id,
        quoteId: quote.id,
        debitAmount: receiptAmount(outgoing.debitAmount),
        receiveAmount: receiptAmount(outgoing.receiveAmount),
        // RF-23: the create response reports the grant total from before this payment.
        grantSpentBefore: minorUnits(outgoing.grantSpentDebitAmount),
      },
    };
  }

  // RF-23: the grant's debit total as the wallet reports it; null (not 0) when it cannot be read, so the receipt never invents a number.
  private async grantSpent(milestoneId: string, resourceServer: string, scope: GrantScope): Promise<number | null> {
    try {
      const spent = await withOutgoingToken(
        this.op,
        milestoneId,
        (accessToken) => this.op.client.outgoingPayment.getGrantSpentAmounts({ url: resourceServer, accessToken }),
        scope,
      );
      // The wallet answers null while nothing was spent.
      return spent.spentDebitAmount ? minorUnits(spent.spentDebitAmount) : 0;
    } catch (error) {
      this.logger.warn(`Grant spent amounts for ${milestoneId} unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async check(reference: string): Promise<LinePaymentResult> {
    const { client } = this.op;
    const { milestoneId, scope, incomingId, outgoingId } = fromReference(reference);
    const grant = await activeOutgoingGrant(this.op.grants, milestoneId, scope);

    const { authServer } = await client.incomingPayment.getPublic({ url: incomingId });
    const accessToken = await requestToken(this.op, authServer, { type: "incoming-payment", actions: ["read"] });
    const incoming = await client.incomingPayment.get({ url: incomingId, accessToken });
    const outgoing = await withOutgoingToken(this.op, milestoneId, (token) => client.outgoingPayment.get({ url: outgoingId, accessToken: token }), scope);
    if (!incoming.completed) return { status: outgoing.failed ? "fallido" : "en_cola", reference };

    const payer = await client.walletAddress.get({ url: grant.payerWalletAddress });
    return {
      status: "completado",
      reference,
      receipt: {
        incomingPaymentId: incomingId,
        outgoingPaymentId: outgoingId,
        quoteId: outgoing.quoteId ?? null,
        debitAmount: receiptAmount(outgoing.debitAmount),
        receiveAmount: receiptAmount(incoming.receivedAmount),
        grantSpentAfter: await this.grantSpent(milestoneId, payer.resourceServer, scope),
      },
    };
  }
}
