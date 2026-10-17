import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MilestoneStore } from "./application/milestone-store";
import { PayLineUseCase } from "./application/pay-line.use-case";
import { ReviewMilestoneUseCase } from "./application/review-milestone.use-case";
import { SubmitEvidenceUseCase } from "./application/submit-evidence.use-case";
import { SyncLinesUseCase } from "./application/sync-lines.use-case";
import { MilestonesController } from "./controllers/milestones.controller";
import { InMemoryMilestoneAdapter } from "./infrastructure/adapters/in-memory-milestone.adapter";
import { SimulatedPaymentGateway } from "./infrastructure/adapters/simulated-payment-gateway.adapter";
import { MilestoneRepository } from "./ports/milestone.repository";
import { PaymentGateway } from "./ports/payment-gateway";

@Module({
  imports: [AuthModule],
  controllers: [MilestonesController],
  providers: [
    MilestoneStore,
    SubmitEvidenceUseCase,
    PayLineUseCase,
    SyncLinesUseCase,
    ReviewMilestoneUseCase,
    { provide: MilestoneRepository, useClass: InMemoryMilestoneAdapter },
    { provide: PaymentGateway, useClass: SimulatedPaymentGateway },
  ],
})
export class MilestonesModule {}
