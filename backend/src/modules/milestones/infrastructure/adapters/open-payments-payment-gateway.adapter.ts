import { Logger } from "@nestjs/common";
import { type LinePaymentRequest, type LinePaymentResult, PaymentGateway } from "../../ports/payment-gateway";
import { type OpenPayments, requestToken, withOutgoingToken } from "./open-payments.client";

// Reference = milestone + incoming + outgoing payment URLs, so check() can read both and pick the right grant.
const SEPARATOR = " ";
const toReference = (milestoneId: string, incomingId: string, outgoingId: string) => [milestoneId, incomingId, outgoingId].join(SEPARATOR);
function fromReference(reference: string) {
  const [milestoneId, incomingId, outgoingId] = reference.split(SEPARATOR);
  if (!milestoneId || !incomingId || !outgoingId) throw new Error(`Not an Open Payments reference: ${reference}`);
  return { milestoneId, incomingId, outgoingId };
}

// Pays each line from the milestone's outgoing grant: incoming payment on the beneficiary, quote and outgoing payment on the investor.
export class OpenPaymentsGateway extends PaymentGateway {
  private readonly logger = new Logger(OpenPaymentsGateway.name);
  // Idempotency by `${milestoneId}:${lineId}`: a line that already has a payment never gets a second one.
  // ponytail: in memory, like the grant store.
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
    const { client, investorWalletAddress } = this.op;
    if (!this.op.grants.outgoing.has(request.milestoneId)) throw new Error(`Milestone ${request.milestoneId} has no outgoing-payment grant`);

    const receiver = await client.walletAddress.get({ url: request.walletAddress });
    // ponytail: no FX. A beneficiary wallet in another asset fails its line.
    if (receiver.assetCode !== request.currency || receiver.assetScale !== request.assetScale) {
      this.logger.warn(
        `Line ${request.lineId} failed: wallet ${receiver.id} holds ${receiver.assetCode}/${receiver.assetScale}, milestone pays ${request.currency}/${request.assetScale} and FX is not supported`,
      );
      return { status: "fallido", reference: null };
    }
    const investor = await client.walletAddress.get({ url: investorWalletAddress });

    const incomingToken = await requestToken(this.op, receiver.authServer, { type: "incoming-payment", actions: ["create", "read"] });
    const incoming = await client.incomingPayment.create(
      { url: receiver.resourceServer, accessToken: incomingToken },
      { walletAddress: receiver.id, incomingAmount: { value: String(request.amount), assetCode: receiver.assetCode, assetScale: receiver.assetScale } },
    );

    const quoteToken = await requestToken(this.op, investor.authServer, { type: "quote", actions: ["create", "read"] });
    const quote = await client.quote.create(
      { url: investor.resourceServer, accessToken: quoteToken },
      { walletAddress: investor.id, receiver: incoming.id, method: "ilp" },
    );

    const outgoing = await withOutgoingToken(this.op, request.milestoneId, (accessToken) =>
      client.outgoingPayment.create({ url: investor.resourceServer, accessToken }, { walletAddress: investor.id, quoteId: quote.id }),
    );
    // Settlement is asynchronous: check() resolves it.
    return { status: "en_cola", reference: toReference(request.milestoneId, incoming.id, outgoing.id) };
  }

  async check(reference: string): Promise<LinePaymentResult> {
    const { client } = this.op;
    const { milestoneId, incomingId, outgoingId } = fromReference(reference);

    const { authServer } = await client.incomingPayment.getPublic({ url: incomingId });
    const accessToken = await requestToken(this.op, authServer, { type: "incoming-payment", actions: ["read"] });
    const incoming = await client.incomingPayment.get({ url: incomingId, accessToken });
    if (incoming.completed) return { status: "completado", reference };

    const outgoing = await withOutgoingToken(this.op, milestoneId, (token) => client.outgoingPayment.get({ url: outgoingId, accessToken: token }));
    return { status: outgoing.failed ? "fallido" : "en_cola", reference };
  }
}
