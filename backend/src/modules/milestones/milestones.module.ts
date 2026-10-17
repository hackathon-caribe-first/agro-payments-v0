import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { loadEnv } from "../../shared/config/env";
import { SecretCipher } from "../../shared/crypto/secret-cipher";
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
import { OpenPaymentsFunding } from "./infrastructure/adapters/open-payments-funding.adapter";
import { OpenPaymentsGateway } from "./infrastructure/adapters/open-payments-payment-gateway.adapter";
import { createOpenPayments, type OpenPayments } from "./infrastructure/adapters/open-payments.client";
import { SimulatedMilestoneFunding } from "./infrastructure/adapters/simulated-milestone-funding.adapter";
import { SimulatedPaymentGateway } from "./infrastructure/adapters/simulated-payment-gateway.adapter";
import { demoMilestones } from "./infrastructure/demo-milestones";
import { MILESTONE_ENTITIES } from "./infrastructure/persistence/entities";
import { TypeOrmGrantStore } from "./infrastructure/persistence/typeorm-grant-store.adapter";
import { TypeOrmMilestoneAdapter } from "./infrastructure/persistence/typeorm-milestone.adapter";
import { GrantStore } from "./ports/grant-store";import { MilestoneFunding } from "./ports/milestone-funding";
import { MilestoneRepository } from "./ports/milestone.repository";
import { PaymentGateway } from "./ports/payment-gateway";

// PAYMENT_GATEWAY picks the adapters: simulated (default) or open-payments, which shares one client and grant store.
// Milestones persist in Postgres in both modes; grants (and their encryption key) exist only in open-payments mode.
const OPEN_PAYMENTS = Symbol("OPEN_PAYMENTS");

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature(MILESTONE_ENTITIES)],
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
    {
      provide: MilestoneRepository,
      inject: [DataSource],
      useFactory: async (dataSource: DataSource) => {
        const repository = new TypeOrmMilestoneAdapter(dataSource);
        // ponytail: the seed follows the mode of the first start; switching PAYMENT_GATEWAY later keeps the stored milestones.
        await repository.seedIfEmpty(demoMilestones(loadEnv().openPayments));
        return repository;
      },
    },
    {
      provide: GrantStore,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => {
        const { openPayments } = loadEnv();
        // A bad GRANT_ENCRYPTION_KEY fails here, at startup, not on the first grant.
        return openPayments ? new TypeOrmGrantStore(dataSource, SecretCipher.fromBase64Key(openPayments.grantEncryptionKey)) : null;
      },
    },
    {
      provide: OPEN_PAYMENTS,
      inject: [GrantStore],
      useFactory: (grants: GrantStore | null) => {
        const { openPayments } = loadEnv();
        return openPayments && grants ? createOpenPayments(openPayments, grants) : null;
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
