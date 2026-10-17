import { Body, Controller, Get, HttpCode, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBody, ApiNotFoundResponse, ApiTags } from "@nestjs/swagger";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { CurrentUser } from "../../auth/controllers/current-user.decorator";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { MILESTONE_ROLES } from "../../milestones/controllers/milestone-roles";
import { CreateProjectUseCase } from "../application/create-project.use-case";
import { ProjectQueries } from "../application/project-queries";
import { toMilestoneSummaryResponse, toProjectResponse } from "./api.mappers";
import { parseCreateProjectRequest } from "./api.requests";
import { MilestoneSummaryResponseDto } from "./dtos/project-milestone.dto";
import { ApiErrorDto, CreateProjectRequestDto, ProjectResponseDto } from "./dtos/project.dto";

const { producer, operator, verifier, investor } = MILESTONE_ROLES;

// PRD producer projects for the web app on feat/producer-milestones. Not a global prefix: legacy routes stay unprefixed.
@ApiTags("projects")
@Controller("api")
@UseGuards(ApiAuthGuard, RolesGuard)
@UseFilters(ApiErrorFilter)
@Roles(producer, operator, verifier, investor)
export class ProjectsController {
  constructor(
    private readonly queries: ProjectQueries,
    private readonly createProjectUseCase: CreateProjectUseCase,
  ) {}

  /** Projects owned by the signed-in producer, oldest first */
  @Get("producer/projects")
  @Roles(producer, operator)
  async listProducerProjects(@CurrentUser() user: AuthenticatedUser): Promise<ProjectResponseDto[]> {
    return (await this.queries.listOwned(user)).map(toProjectResponse);
  }

  /** Get a project; another producer's project is a 404 */
  @Get("projects/:projectId")
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async getProject(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser): Promise<ProjectResponseDto> {
    return toProjectResponse(await this.queries.get(projectId, user));
  }

  /** Create a DRAFT project with its ordered milestones; the caller is the owner. Budgets in whole pesos. */
  @Post("projects")
  @Roles(producer, operator)
  @HttpCode(201)
  @ApiBody({ type: CreateProjectRequestDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: "errors keyed by field path, e.g. milestones.2.laborBudget" })
  async createProject(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<ProjectResponseDto> {
    // body stays unknown so the global ValidationPipe passes it through untouched; the field rules live in the domain.
    return toProjectResponse(await this.createProjectUseCase.execute(user, parseCreateProjectRequest(body)));
  }

  /** A project's milestones in sequence order, with their derived status */
  @Get("projects/:projectId/milestones")
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async listMilestones(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser): Promise<MilestoneSummaryResponseDto[]> {
    return (await this.queries.milestones(projectId, user)).map(toMilestoneSummaryResponse);
  }
}
