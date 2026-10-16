import { Module } from "@nestjs/common";
import { CreatePaymentUseCase } from "./application/create-payment.use-case";
import { GetPaymentUseCase } from "./application/get-payment.use-case";
import { PaymentsController } from "./controllers/payments.controller";
import { InMemoryPaymentAdapter } from "./infrastructure/adapters/in-memory-payment.adapter";
import { PaymentRepository } from "./ports/payment.repository";

@Module({
  controllers: [PaymentsController],
  providers: [
    CreatePaymentUseCase,
    GetPaymentUseCase,
    { provide: PaymentRepository, useClass: InMemoryPaymentAdapter },
  ],
})
export class PaymentsModule {}
