import { DomainError } from "../../../../shared/domain-errors";
import type { Clock } from "../../application/investments.use-cases";
import { type Investment, SIMULATED_COP_RATES, simulatedQuote } from "../../domain/investment";
import { type CaptureCompletion, type CaptureStart, InvestmentCapture, type InvestorWallet } from "../../ports/investment-capture";

// PAYMENT_GATEWAY=simulated: the capture completes synchronously at the fixed demo rate (SIMULATED_COP_RATES). There is never
// a wallet callback and nothing reaches the network.
// ponytail: the wallet's currency is read from a currency suffix of its URL (…/inversionista_usd, …/maria-eur), else COP,
// because simulated mode cannot GET the wallet address; Open Payments mode reads the real assetCode/assetScale.
export class SimulatedInvestmentCapture extends InvestmentCapture {
  constructor(private readonly clock: Clock = { now: () => new Date() }) {
    super();
  }

  async wallet(url: string): Promise<InvestorWallet> {
    const suffix = /[-_]([a-z]{3})\/?$/i.exec(new URL(url).pathname)?.[1]?.toUpperCase();
    const assetCode = suffix && suffix in SIMULATED_COP_RATES ? suffix : "COP";
    return { id: url, assetCode, assetScale: 2 };
  }

  async start(investment: Investment, wallet: InvestorWallet): Promise<CaptureStart> {
    const quote = simulatedQuote(investment.id, investment.amount, investment.assetScale, wallet, this.clock.now());
    return { kind: "captured", quote, incomingPaymentId: null, outgoingPaymentId: `SIM-CAPTURE-${investment.id}` };
  }

  async complete(): Promise<CaptureCompletion> {
    throw new DomainError("Simulated captures complete at once: there is no wallet callback to finish");
  }
}
