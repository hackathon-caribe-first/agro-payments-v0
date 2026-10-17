import { Body, Controller, Get, HttpCode, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiNotFoundResponse, ApiTags } from "@nestjs/swagger";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { CurrentUser } from "../../auth/controllers/current-user.decorator";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { MILESTONE_ROLES } from "../../milestones/controllers/milestone-roles";
import { MilestoneEvidenceUseCase } from "../application/milestone-evidence.use-case";
import { ProjectQueries } from "../application/project-queries";
import { toEvidenceLogResponse, toMilestoneDetailResponse } from "./api.mappers";
import { parseEvidenceLogRequest } from "./api.requests";
import { EvidenceLogRequestDto, EvidenceLogResponseDto, MilestoneDetailResponseDto } from "./dtos/project-milestone.dto";
import { ApiErrorDto } from "./dtos/project.dto";

const { producer, operator, fiduciaria, investor } = MILESTONE_ROLES;

// PRD view of the same milestones the legacy /milestones routes serve; the verifier still reviews through POST /milestones/:id/review.
@ApiTags("projects")
@Controller("api/milestones")
@UseGuards(ApiAuthGuard, RolesGuard)
@UseFilters(ApiErrorFilter)
@Roles(producer, operator, fiduciaria, investor)
export class ProducerMilestonesController {
  constructor(
    private readonly queries: ProjectQueries,
    private readonly evidence: MilestoneEvidenceUseCase,
  ) {}

  /** Milestone detail: requirements, evidence logs and review history */
  @Get(":id")
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async getMilestone(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser): Promise<MilestoneDetailResponseDto> {
    return toMilestoneDetailResponse(await this.queries.milestone(id, user));
  }

  /** Producer records a field log; 409 when the status takes no evidence, 400 when the payload misses the requirements */
  @Post(":id/logs")
  @Roles(producer, operator)
  @HttpCode(201)
  @ApiBody({ type: EvidenceLogRequestDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ type: ApiErrorDto })
  async addLog(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<EvidenceLogResponseDto> {
    return toEvidenceLogResponse(id, await this.evidence.addLog(id, user, parseEvidenceLogRequest(body)));
  }

  /** Producer submits for review once the latest value of every requirement is met; 409 otherwise */
  @Post(":id/submit")
  @Roles(producer, operator)
  @HttpCode(200)
  @ApiConflictResponse({ type: ApiErrorDto })
  async submit(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser): Promise<MilestoneDetailResponseDto> {
    return toMilestoneDetailResponse(await this.evidence.submit(id, user));
  }
}
