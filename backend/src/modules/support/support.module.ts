import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuthModule } from "../auth/auth.module";
import { SupportController } from "./controllers/support.controller";
import { PostgresOpTraceRepository } from "./infrastructure/postgres-op-trace.repository";
import { PostgresPaymentStepRepository } from "./infrastructure/postgres-payment-step.repository";
import { OpTraceRepository } from "./ports/op-trace.repository";
import { PaymentStepRepository } from "./ports/payment-step.repository";

// RF-28 support trace and the payment step timeline. MilestonesModule imports this one to wrap the Open Payments client, and
// every module that pays imports it to record its payments' steps (no reverse dependency).
@Module({
  imports: [AuthModule],
  controllers: [SupportController],
  providers: [
    { provide: OpTraceRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new PostgresOpTraceRepository(dataSource) },
    { provide: PaymentStepRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new PostgresPaymentStepRepository(dataSource) },
  ],
  exports: [OpTraceRepository, PaymentStepRepository],
})
export class SupportModule {}
