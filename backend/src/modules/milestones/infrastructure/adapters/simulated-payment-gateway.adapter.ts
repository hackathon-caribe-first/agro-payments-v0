import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { LineReceiptUpdate } from "../../application/milestone";
import { type LinePaymentRequest, type LinePaymentResult, PaymentGateway } from "../../ports/payment-gateway";

// RF-23 in simulated mode: no FX and no fees, so the beneficiary receives exactly the debit (rate 1/1, derived by mergeReceipt).
// The SIM- ids stand for the incoming payment, outgoing payment and quote; the grant totals are unknown without a wallet (null).
const simulatedReceipt = (request: LinePaymentRequest, id: string): LineReceiptUpdate => {
  const amount = { value: request.amount, assetCode: request.currency, assetScale: request.assetScale };
  return {
    incomingPaymentId: `SIM-IN-${id}`,
    outgoingPaymentId: `SIM-OUT-${id}`,
    quoteId: `SIM-QUOTE-${id}`,
    debitAmount: amount,
    receiveAmount: amount,
    grantSpentBefore: null,
    grantSpentAfter: null,
  };
};

// ponytail: no network. A wallet address containing "fail" simulates a rejected payment; swap for the Open Payments adapter in milestones.module.ts
@Injectable()
export class SimulatedPaymentGateway extends PaymentGateway {
  async pay(request: LinePaymentRequest): Promise<LinePaymentResult> {
    if (request.walletAddress.includes("fail")) return { status: "fallido", reference: null };
    const id = randomUUID().slice(0, 8).toUpperCase();
    // Settlement payouts (fixedDebitAmount) and milestone lines alike: the receipt is complete at once; check() only settles it.
    return { status: "en_cola", reference: `SIM-${id}`, receipt: simulatedReceipt(request, id) };
  }

  async check(reference: string): Promise<LinePaymentResult> {
    return { status: "completado", reference };
  }
}
