import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ConfirmPaymentUseCase } from "../application/confirm-payment.use-case";
import { MilestoneStore } from "../application/milestone-store";
import { OrderPaymentUseCase } from "../application/order-payment.use-case";
import { ReviewMilestoneUseCase } from "../application/review-milestone.use-case";
import { SubmitEvidenceUseCase } from "../application/submit-evidence.use-case";
import { MilestoneDto } from "./dtos/milestone.response.dto";
import { ReviewMilestoneDto } from "./dtos/review-milestone.dto";
import { SubmitEvidenceDto } from "./dtos/submit-evidence.dto";

@ApiTags("milestones")
@Controller("milestones")
export class MilestonesController {
  constructor(
    private readonly store: MilestoneStore,
    private readonly submitEvidence: SubmitEvidenceUseCase,
    private readonly reviewMilestone: ReviewMilestoneUseCase,
    private readonly orderPayment: OrderPaymentUseCase,
    private readonly confirmPayment: ConfirmPaymentUseCase,
  ) {}

  /** List milestones */
  @Get()
  list(): Promise<MilestoneDto[]> {
    return this.store.list();
  }

  /** Get a milestone */
  @Get(":id")
  get(@Param("id") id: string): Promise<MilestoneDto> {
    return this.store.get(id);
  }

  /** Producer submits evidence for verification */
  @Post(":id/evidence")
  @HttpCode(200)
  addEvidence(@Param("id") id: string, @Body() dto: SubmitEvidenceDto): Promise<MilestoneDto> {
    return this.submitEvidence.execute(id, dto.description);
  }

  /** Verifier approves or rejects the evidence. Approving does not order a payment. */
  @Post(":id/review")
  @HttpCode(200)
  review(@Param("id") id: string, @Body() dto: ReviewMilestoneDto): Promise<MilestoneDto> {
    return this.reviewMilestone.execute(id, dto.decision, dto.reason ?? null);
  }

  /** Custodian orders the simulated 50/30/20 payment of an approved milestone */
  @Post(":id/payment")
  @HttpCode(200)
  pay(@Param("id") id: string): Promise<MilestoneDto> {
    return this.orderPayment.execute(id);
  }

  /** Custodian confirms the simulated payment was received */
  @Post(":id/payment/confirmation")
  @HttpCode(200)
  confirm(@Param("id") id: string): Promise<MilestoneDto> {
    return this.confirmPayment.execute(id);
  }
}
