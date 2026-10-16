import { Injectable } from "@nestjs/common";
import { type Payment, PaymentRepositoryPort } from "../../ports/payment.repository.port";

// ponytail: in-memory until the DB is chosen; swap for a prisma-payment.adapter.ts in payments.module.ts
@Injectable()
export class InMemoryPaymentAdapter extends PaymentRepositoryPort {
  private readonly payments = new Map<string, Payment>();

  async save(payment: Payment) {
    this.payments.set(payment.id, payment);
  }

  async findById(id: string) {
    return this.payments.get(id) ?? null;
  }
}
