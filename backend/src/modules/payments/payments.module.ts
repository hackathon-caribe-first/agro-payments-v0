import { Module } from "@nestjs/common";
import { CreatePaymentUseCase } from "./application/create-payment.use-case";
import { GetPaymentUseCase } from "./application/get-payment.use-case";
import { PaymentsController } from "./controllers/payments.controller";
import { InMemoryPaymentAdapter } from "./infrastructure/adapters/in-memory-payment.adapter";
import { PaymentRepositoryPort } from "./ports/payment.repository.port";

@Module({
  controllers: [PaymentsController],
  providers: [
    CreatePaymentUseCase,
    GetPaymentUseCase,
    { provide: PaymentRepositoryPort, useClass: InMemoryPaymentAdapter },
  ],
})
export class PaymentsModule {}
