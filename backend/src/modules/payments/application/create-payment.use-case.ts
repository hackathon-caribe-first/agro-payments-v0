import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { type Payment, PaymentRepository } from "../ports/payment.repository";

@Injectable()
export class CreatePaymentUseCase {
  constructor(private readonly payments: PaymentRepository) {}

  async execute(input: { amount: number; currency: string }): Promise<Payment> {
    const payment = { id: randomUUID(), ...input, createdAt: new Date() };
    await this.payments.save(payment);
    return payment;
  }
}
