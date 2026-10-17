import { Module } from "@nestjs/common";
import { loadEnv } from "../../shared/config/env";
import { AuthModule } from "../auth/auth.module";
import { CompleteFundingUseCase } from "./application/complete-funding.use-case";
import { MilestoneStore } from "./application/milestone-store";
import { PayLineUseCase } from "./application/pay-line.use-case";
import { ReviewMilestoneUseCase } from "./application/review-milestone.use-case";
import { StartFundingUseCase } from "./application/start-funding.use-case";
import { SubmitEvidenceUseCase } from "./application/submit-evidence.use-case";
import { SyncLinesUseCase } from "./application/sync-lines.use-case";
import { MilestoneFundingCallbackController, WEB_APP_URL } from "./controllers/milestone-funding-callback.controller";
import { MilestonesController } from "./controllers/milestones.controller";
import { InMemoryMilestoneAdapter } from "./infrastructure/adapters/in-memory-milestone.adapter";
import { OpenPaymentsFunding } from "./infrastructure/adapters/open-payments-funding.adapter";
import { OpenPaymentsGateway } from "./infrastructure/adapters/open-payments-payment-gateway.adapter";
import { createOpenPayments, type OpenPayments } from "./infrastructure/adapters/open-payments.client";
import { SimulatedMilestoneFunding } from "./infrastructure/adapters/simulated-milestone-funding.adapter";
import { SimulatedPaymentGateway } from "./infrastructure/adapters/simulated-payment-gateway.adapter";
import { MilestoneFunding } from "./ports/milestone-funding";
import { MilestoneRepository } from "./ports/milestone.repository";
import { PaymentGateway } from "./ports/payment-gateway";

// PAYMENT_GATEWAY picks the adapters: simulated (default) or open-payments, which shares one client and grant store.
const OPEN_PAYMENTS = Symbol("OPEN_PAYMENTS");

@Module({
  imports: [AuthModule],
  controllers: [MilestonesController, MilestoneFundingCallbackController],
  providers: [
    MilestoneStore,
    SubmitEvidenceUseCase,
    PayLineUseCase,
    SyncLinesUseCase,
    ReviewMilestoneUseCase,
    StartFundingUseCase,
    CompleteFundingUseCase,
    { provide: WEB_APP_URL, useFactory: () => loadEnv().webOrigins[0] },
    { provide: MilestoneRepository, useFactory: () => new InMemoryMilestoneAdapter(loadEnv().openPayments) },
    {
      provide: OPEN_PAYMENTS,
      useFactory: () => {
        const { openPayments } = loadEnv();
        return openPayments ? createOpenPayments(openPayments) : null;
      },
    },
    {
      provide: PaymentGateway,
      inject: [OPEN_PAYMENTS],
      useFactory: (op: OpenPayments | null) => (op ? new OpenPaymentsGateway(op) : new SimulatedPaymentGateway()),
    },
    {
      provide: MilestoneFunding,
      inject: [OPEN_PAYMENTS],
      useFactory: (op: OpenPayments | null) => {
        const { apiUrl } = loadEnv();
        return op ? new OpenPaymentsFunding(op, apiUrl) : new SimulatedMilestoneFunding(apiUrl);
      },
    },
  ],
})
export class MilestonesModule {}
