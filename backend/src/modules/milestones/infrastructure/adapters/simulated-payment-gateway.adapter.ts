import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { type LinePaymentRequest, type LinePaymentResult, PaymentGateway } from "../../ports/payment-gateway";

// ponytail: no network. A wallet address containing "fail" simulates a rejected payment; swap for the Open Payments adapter in milestones.module.ts
@Injectable()
export class SimulatedPaymentGateway extends PaymentGateway {
  async pay(request: LinePaymentRequest): Promise<LinePaymentResult> {
    if (request.walletAddress.includes("fail")) return { status: "fallido", reference: null };
    const reference = `SIM-${randomUUID().slice(0, 8).toUpperCase()}`;
    // A fixed debit is known up front; what the foreign wallet receives depends on a quote this adapter does not simulate.
    if (request.fixedDebitAmount) return { status: "en_cola", reference, receipt: { debitAmount: { value: request.amount, assetCode: request.currency, assetScale: request.assetScale } } };
    return { status: "en_cola", reference };
  }

  async check(reference: string): Promise<LinePaymentResult> {
    return { status: "completado", reference };
  }
}
