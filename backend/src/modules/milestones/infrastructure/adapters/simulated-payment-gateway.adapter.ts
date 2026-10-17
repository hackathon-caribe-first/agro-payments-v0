import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { type LinePaymentRequest, type LinePaymentResult, PaymentGateway } from "../../ports/payment-gateway";

// ponytail: no network. A wallet address containing "fail" simulates a rejected payment; swap for the Open Payments adapter in milestones.module.ts
@Injectable()
export class SimulatedPaymentGateway extends PaymentGateway {
  async pay(request: LinePaymentRequest): Promise<LinePaymentResult> {
    if (request.walletAddress.includes("fail")) return { status: "fallido", reference: null };
    return { status: "en_cola", reference: `SIM-${randomUUID().slice(0, 8).toUpperCase()}` };
  }

  async check(reference: string): Promise<LinePaymentResult> {
    return { status: "completado", reference };
  }
}
