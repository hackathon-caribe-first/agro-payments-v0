import { Injectable, NotFoundException } from "@nestjs/common";
import { type Payment, PaymentRepositoryPort } from "../ports/payment.repository.port";

@Injectable()
export class GetPaymentUseCase {
  constructor(private readonly payments: PaymentRepositoryPort) {}

  async execute(id: string): Promise<Payment> {
    const payment = await this.payments.findById(id);
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }
}
