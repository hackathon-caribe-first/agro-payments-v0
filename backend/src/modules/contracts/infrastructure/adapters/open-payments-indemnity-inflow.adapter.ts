import { DomainError } from "../../../../shared/domain-errors";
import { type OpenPayments, requestToken } from "../../../milestones/infrastructure/adapters/open-payments.client";
import { IndemnityInflow, type IndemnityOrder } from "../../ports/indemnity-inflow";

// RF-25 / request #26: an incoming payment on the custody wallet (non-interactive incoming-payment grant) for the exact indemnity.
// The insurer pays it from its own wallet; confirming reads its receivedAmount.
export class OpenPaymentsIndemnityInflow extends IndemnityInflow {
  constructor(private readonly op: OpenPayments) {
    super();
  }

  async request(order: IndemnityOrder) {
    const { client, custodyWalletAddress } = this.op;
    const custody = await client.walletAddress.get({ url: custodyWalletAddress });
    if (custody.assetCode !== order.currency || custody.assetScale !== order.assetScale) {
      throw new DomainError(`Custody wallet holds ${custody.assetCode}/${custody.assetScale} but the indemnity is ${order.currency}/${order.assetScale}`);
    }
    const accessToken = await requestToken(this.op, custody.authServer, { type: "incoming-payment", actions: ["create", "read"] });
    const incoming = await client.incomingPayment.create(
      { url: custody.resourceServer, accessToken },
      {
        walletAddress: custody.id,
        incomingAmount: { value: String(order.amount), assetCode: order.currency, assetScale: order.assetScale },
        metadata: { project: order.projectId, claim: order.claimId, concept: "indemnizacion" },
      },
    );
    return incoming.id;
  }

  async received(incomingPaymentUrl: string) {
    const { client } = this.op;
    const { authServer } = await client.incomingPayment.getPublic({ url: incomingPaymentUrl });
    const accessToken = await requestToken(this.op, authServer, { type: "incoming-payment", actions: ["read"] });
    const incoming = await client.incomingPayment.get({ url: incomingPaymentUrl, accessToken });
    const value = Number(incoming.receivedAmount?.value ?? 0);
    return Number.isSafeInteger(value) ? value : 0;
  }
}
