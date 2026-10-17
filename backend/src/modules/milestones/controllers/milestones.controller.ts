import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../../auth/controllers/auth.guard";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { MilestoneStore } from "../application/milestone-store";
import { PayLineUseCase } from "../application/pay-line.use-case";
import { ReviewMilestoneUseCase } from "../application/review-milestone.use-case";
import { SubmitEvidenceUseCase } from "../application/submit-evidence.use-case";
import { SyncLinesUseCase } from "../application/sync-lines.use-case";
import { MilestoneDto } from "./dtos/milestone.response.dto";
import { ReviewMilestoneDto } from "./dtos/review-milestone.dto";
import { SubmitEvidenceDto } from "./dtos/submit-evidence.dto";
import { MILESTONE_ROLES } from "./milestone-roles";

const { verifier, producer, operator } = MILESTONE_ROLES;

@ApiTags("milestones")
@Controller("milestones")
@UseGuards(AuthGuard, RolesGuard)
@Roles(verifier, producer, operator)
export class MilestonesController {
  constructor(
    private readonly store: MilestoneStore,
    private readonly submitEvidence: SubmitEvidenceUseCase,
    private readonly reviewMilestone: ReviewMilestoneUseCase,
    private readonly payLineUseCase: PayLineUseCase,
    private readonly syncLines: SyncLinesUseCase,
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
  @Roles(producer)
  @HttpCode(200)
  addEvidence(@Param("id") id: string, @Body() dto: SubmitEvidenceDto): Promise<MilestoneDto> {
    return this.submitEvidence.execute(id, dto.description);
  }

  /** Verifier approves or observes the evidence. Approving pays the producer line. */
  @Post(":id/review")
  @Roles(verifier)
  @HttpCode(200)
  review(@Param("id") id: string, @Body() dto: ReviewMilestoneDto): Promise<MilestoneDto> {
    return this.reviewMilestone.execute(id, dto.decision, dto.reason ?? null);
  }

  /** Operator pays one line. Supplier lines can be paid before approval, the producer line cannot. */
  @Post(":id/lines/:lineId/payment")
  @Roles(operator)
  @HttpCode(200)
  payLine(@Param("id") id: string, @Param("lineId") lineId: string): Promise<MilestoneDto> {
    return this.payLineUseCase.execute(id, lineId);
  }

  /** Operator resolves the lines the gateway left en_cola */
  @Post(":id/lines/sync")
  @Roles(operator)
  @HttpCode(200)
  sync(@Param("id") id: string): Promise<MilestoneDto> {
    return this.syncLines.execute(id);
  }
}
