import { Injectable, NotFoundException } from "@nestjs/common";
import { type Payment, PaymentRepository } from "../ports/payment.repository";

@Injectable()
export class GetPaymentUseCase {
  constructor(private readonly payments: PaymentRepository) {}

  async execute(id: string): Promise<Payment> {
    const payment = await this.payments.findById(id);
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }
}
