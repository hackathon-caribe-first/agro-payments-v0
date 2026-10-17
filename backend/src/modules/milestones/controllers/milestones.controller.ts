import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../../auth/controllers/auth.guard";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import type { Milestone } from "../application/milestone";
import { MilestoneStore } from "../application/milestone-store";
import { PayLineUseCase } from "../application/pay-line.use-case";
import { ReviewMilestoneUseCase } from "../application/review-milestone.use-case";
import { StartFundingUseCase } from "../application/start-funding.use-case";
import { SubmitEvidenceUseCase } from "../application/submit-evidence.use-case";
import { SyncLinesUseCase } from "../application/sync-lines.use-case";
import { FundingStartDto } from "./dtos/funding-start.response.dto";
import { MilestoneDto } from "./dtos/milestone.response.dto";
import { ReviewMilestoneDto } from "./dtos/review-milestone.dto";
import { SubmitEvidenceDto } from "./dtos/submit-evidence.dto";
import { MILESTONE_ROLES } from "./milestone-roles";

const { verifier, fiduciaria, producer, operator } = MILESTONE_ROLES;

// The legacy wire shape stays exactly MilestoneDto: the PRD fields are served by /api/milestones only.
const toDto = ({ projectId, sequenceOrder, description, estimatedCompletionDate, requirements, evidenceLogs, reviews, ...legacy }: Milestone): MilestoneDto =>
  legacy;

@ApiTags("milestones")
@Controller("milestones")
@UseGuards(AuthGuard, RolesGuard)
@Roles(verifier, fiduciaria, producer, operator)
export class MilestonesController {
  constructor(
    private readonly store: MilestoneStore,
    private readonly submitEvidence: SubmitEvidenceUseCase,
    private readonly reviewMilestone: ReviewMilestoneUseCase,
    private readonly payLineUseCase: PayLineUseCase,
    private readonly syncLines: SyncLinesUseCase,
    private readonly startFundingUseCase: StartFundingUseCase,
  ) {}

  /** List milestones */
  @Get()
  async list(): Promise<MilestoneDto[]> {
    return (await this.store.list()).map(toDto);
  }

  /** Get a milestone */
  @Get(":id")
  async get(@Param("id") id: string): Promise<MilestoneDto> {
    return toDto(await this.store.get(id));
  }

  /** Producer submits evidence for verification */
  @Post(":id/evidence")
  @Roles(producer)
  @HttpCode(200)
  async addEvidence(@Param("id") id: string, @Body() dto: SubmitEvidenceDto): Promise<MilestoneDto> {
    return toDto(await this.submitEvidence.execute(id, dto.description));
  }

  /** Verifier approves or observes the evidence. Approving pays the jornales line and the milestone fee (RF-20). */
  @Post(":id/review")
  @Roles(verifier)
  @HttpCode(200)
  async review(@Param("id") id: string, @Body() dto: ReviewMilestoneDto): Promise<MilestoneDto> {
    return toDto(await this.reviewMilestone.execute(id, dto.decision, dto.reason ?? null));
  }

  /** RF-13: the fiduciaria starts the milestone grant; send the browser to redirectUrl to approve it on the custody wallet. 409 while another milestone of the project holds a live grant */
  @Post(":id/funding")
  @Roles(fiduciaria, operator)
  @HttpCode(200)
  startFunding(@Param("id") id: string): Promise<FundingStartDto> {
    return this.startFundingUseCase.execute(id);
  }

  /** Operator pays one line of a funded milestone. Supplier lines can be paid before approval, the producer line cannot. */
  @Post(":id/lines/:lineId/payment")
  @Roles(operator)
  @HttpCode(200)
  async payLine(@Param("id") id: string, @Param("lineId") lineId: string): Promise<MilestoneDto> {
    return toDto(await this.payLineUseCase.execute(id, lineId));
  }

  /** Operator resolves the lines the gateway left en_cola */
  @Post(":id/lines/sync")
  @Roles(operator)
  @HttpCode(200)
  async sync(@Param("id") id: string): Promise<MilestoneDto> {
    return toDto(await this.syncLines.execute(id));
  }
}
