import { Body, Controller, Get, HttpCode, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { FORM_LEVEL_KEY, ValidationError } from "../../../shared/domain-errors";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { CurrentUser } from "../../auth/controllers/current-user.decorator";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { MILESTONE_ROLES } from "../../milestones/controllers/milestone-roles";
import { type AdmissionRequest, AdmissionUseCases, type ProjectAdmission } from "../application/admission";

const { producer, operator, fiduciaria, investor, verifier } = MILESTONE_ROLES;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Shape only (form-level 400); the filter/evidence/block rules and their messages live in validateAdmissionRequest. */
export function parseAdmissionRequest(body: unknown): AdmissionRequest {
  if (!isObject(body) || !isObject(body.blocks)) throw new ValidationError({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] }, "Invalid request shape");
  return { filters: body.filters as AdmissionRequest["filters"], blocks: body.blocks as AdmissionRequest["blocks"] };
}

export const toAdmissionResponse = (a: ProjectAdmission) => ({
  id: a.id,
  project_id: a.projectId,
  admitted: a.outcome.admitted,
  failed_filters: a.outcome.failedFilters,
  score: a.outcome.score,
  level: a.outcome.level,
  milestones: a.outcome.milestones,
  milestone_range: a.outcome.milestoneRange,
  financeable_pct: a.outcome.financeablePct,
  labor_line: a.outcome.laborLine,
  filters: a.filters,
  blocks: a.blocks,
  motor_version: a.motorVersion,
  created_by: a.createdBy,
  created_at: a.createdAt.toISOString(),
});

// RF-02/RF-03: Fase 0 admission of a project. ponytail: no swagger DTOs and openapi.yaml not regenerated for these routes yet.
@ApiTags("simulation")
@Controller("api/projects/:projectId/admission")
@UseGuards(ApiAuthGuard, RolesGuard)
@UseFilters(ApiErrorFilter)
@Roles(producer, operator, fiduciaria, investor, verifier)
export class AdmissionController {
  constructor(private readonly admissions: AdmissionUseCases) {}

  /** Nine filters with evidence plus the seven A15 blocks → binary result, score, level, milestones, financeable %, jornales line */
  @Post()
  @Roles(producer, operator, verifier)
  @HttpCode(201)
  async assess(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return toAdmissionResponse(await this.admissions.assess(projectId, user, parseAdmissionRequest(body)));
  }

  /** The project's latest admission; 404 before the first one */
  @Get()
  async latest(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return toAdmissionResponse(await this.admissions.latest(projectId, user));
  }
}
