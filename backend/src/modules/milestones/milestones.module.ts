import { Module } from "@nestjs/common";
import { ConfirmPaymentUseCase } from "./application/confirm-payment.use-case";
import { MilestoneStore } from "./application/milestone-store";
import { OrderPaymentUseCase } from "./application/order-payment.use-case";
import { ReviewMilestoneUseCase } from "./application/review-milestone.use-case";
import { SubmitEvidenceUseCase } from "./application/submit-evidence.use-case";
import { MilestonesController } from "./controllers/milestones.controller";
import { InMemoryMilestoneAdapter } from "./infrastructure/adapters/in-memory-milestone.adapter";
import { MilestoneRepository } from "./ports/milestone.repository";

@Module({
  controllers: [MilestonesController],
  providers: [
    MilestoneStore,
    SubmitEvidenceUseCase,
    ReviewMilestoneUseCase,
    OrderPaymentUseCase,
    ConfirmPaymentUseCase,
    { provide: MilestoneRepository, useClass: InMemoryMilestoneAdapter },
  ],
})
export class MilestonesModule {}
