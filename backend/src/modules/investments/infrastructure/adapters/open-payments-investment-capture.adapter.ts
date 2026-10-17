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
import type { Clock } from "../../application/investments.use-cases";
import { type CaptureQuote, exceedsGrant, type Investment, mustRequote } from "../../domain/investment";
import { type CaptureCompletion, type CaptureStart, InvestmentCapture, type InvestorWallet } from "../../ports/investment-capture";

type WalletAddress = Awaited<ReturnType<OpenPayments["client"]["walletAddress"]["get"]>>;
type Amount = { value: string; assetCode: string; assetScale: number };

const minor = (amount: Amount, what: string) => {
  const n = Number(amount.value);
  if (!Number.isSafeInteger(n)) throw new DomainError(`${what} ${amount.value} is not a safe integer amount`);
  return n;
};

// Display only (failure reasons): "2251" at scale 2 → "22.51". String slicing, never floats.
const format = (value: number, scale: number, code: string) => {
  const digits = String(value).padStart(scale + 1, "0");
  return `${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits} ${code}`;
};

// PRD v3 Fase 1 / RF-29, in this order so the investor approves an exact amount in their own currency:
//   start     incoming payment on the custody wallet for the COP amount (metadata {project, investment}) → quote on the investor's
//             wallet with that receiver and the COP receive side fixed → interactive outgoing grant capped at quote.debitAmount.
//   complete  GNAP hash + continue → re-quote if the quote expired (RNF-13), refused when the new debit exceeds the approval →
//             outgoing payment with the quote id.
// ponytail: PRD step 1 creates ONE incoming payment for K_INV shared by every investor; "a single IncomingPayment receiving
// several payments" is still on the PRD's to-validate list and one investor's failed or partial payment would blur everyone's
// receipt, so each investment gets its own incoming payment. The capture bar adds up investments, not one receivedAmount.
// The grant limit is the quoted debit exactly (PRD: limits.debitAmount = the contribution in their currency, no fee buffer):
// the quote already includes the wallet's fees.
export class OpenPaymentsInvestmentCapture extends InvestmentCapture {
  constructor(
    private readonly op: OpenPayments,
    private readonly apiUrl: string,
    private readonly clock: Clock = { now: () => new Date() },
  ) {
    super();
  }

  async wallet(url: string): Promise<InvestorWallet> {
    const { id, assetCode, assetScale } = await this.op.client.walletAddress.get({ url });
    return { id, assetCode, assetScale };
  }

  private async quote(investor: WalletAddress, receiver: string, investment: Investment): Promise<CaptureQuote> {
    const token = await requestToken(this.op, investor.authServer, { type: "quote", actions: ["create", "read"] });
    const quote = await this.op.client.quote.create(
      { url: investor.resourceServer, accessToken: token },
      {
        walletAddress: investor.id,
        receiver,
        receiveAmount: { value: String(investment.amount), assetCode: investment.currency, assetScale: investment.assetScale },
        method: "ilp",
      },
    );
    return {
      id: quote.id,
      debitAmount: minor(quote.debitAmount, "Quoted debit"),
      debitAssetCode: quote.debitAmount.assetCode,
      debitAssetScale: quote.debitAmount.assetScale,
      receiveAmount: minor(quote.receiveAmount, "Quoted receive"),
      expiresAt: quote.expiresAt ?? null,
    };
  }

  async start(investment: Investment, wallet: InvestorWallet): Promise<CaptureStart> {
    const { client, grants, custodyWalletAddress } = this.op;
    const custody = await client.walletAddress.get({ url: custodyWalletAddress });
    if (custody.assetCode !== investment.currency || custody.assetScale !== investment.assetScale) {
      throw new DomainError(`Custody wallet ${custody.id} holds ${custody.assetCode}/${custody.assetScale}, the project is ${investment.currency}/${investment.assetScale}`);
    }
    const investor = await client.walletAddress.get({ url: wallet.id });
    if (investor.id === custody.id) throw new DomainError("La billetera del inversionista no puede ser la billetera de custodia.");

    const incomingToken = await requestToken(this.op, custody.authServer, { type: "incoming-payment", actions: ["create", "read"] });
    const incoming = await client.incomingPayment.create(
      { url: custody.resourceServer, accessToken: incomingToken },
      {
        walletAddress: custody.id,
        incomingAmount: { value: String(investment.amount), assetCode: investment.currency, assetScale: investment.assetScale },
        metadata: { project: investment.projectId, investment: investment.id },
      },
    );
    const quote = await this.quote(investor, incoming.id, investment);

    const finishUri = `${this.apiUrl}/api/investments/${encodeURIComponent(investment.id)}/callback`;
    const { redirectUrl, pending } = await requestInteractiveOutgoingGrant(this.op, investor, quote.debitAmount, finishUri);
    await grants.save({
      id: randomUUID(),
      purpose: GRANT_PURPOSE.INVESTOR_CAPTURE,
      projectId: investment.projectId,
      milestoneId: null,
      investmentId: investment.id,
      payerWalletAddress: investor.id,
      assetCode: investor.assetCode,
      assetScale: investor.assetScale,
      debitLimit: quote.debitAmount,
      status: GRANT_STATUS.PENDING,
      pending,
      access: null,
      createdAt: new Date(),
      revokedAt: null,
    });
    return { kind: "consent", redirectUrl, quote, incomingPaymentId: incoming.id };
  }

  async complete(investment: Investment, callback: FundingCallback): Promise<CaptureCompletion> {
    const { client, grants } = this.op;
    const { quote: approved, incomingPaymentId } = investment;
    if (!approved || !incomingPaymentId) throw new DomainError(`Investment ${investment.id} has no quote to pay`);
    const grant = await grants.findLatestForInvestment(investment.id);
    const { access, payerWalletAddress, debitLimit, assetScale, assetCode } = await finalizeInteractiveGrant(this.op, grant, callback, `Investment ${investment.id}`);

    // The consent is consumed from here on: every outcome is returned so the investment records it.
    let quote = approved;
    try {
      const investor = await client.walletAddress.get({ url: payerWalletAddress });
      if (mustRequote(quote.expiresAt, this.clock.now())) {
        quote = await this.quote(investor, incomingPaymentId, investment);
        if (exceedsGrant(quote.debitAmount, debitLimit)) {
          const reason = `La cotización venció y la nueva (${format(quote.debitAmount, quote.debitAssetScale, quote.debitAssetCode)}) supera lo aprobado (${format(debitLimit, assetScale, assetCode)}). Vuelve a invertir.`;
          return { kind: "failed", quote, reason };
        }
      }
      // The token is fresh from the continue call, so no rotation is needed here.
      const outgoing = await client.outgoingPayment.create({ url: investor.resourceServer, accessToken: access.accessToken }, { walletAddress: investor.id, quoteId: quote.id });
      if (outgoing.failed) return { kind: "failed", quote, reason: "La billetera rechazó el pago." };
      // ponytail: a created outgoing payment counts as captured, like the buyer deposit; confirm via the incoming payment later.
      return { kind: "captured", quote, outgoingPaymentId: outgoing.id };
    } catch (error) {
      return { kind: "failed", quote, reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
