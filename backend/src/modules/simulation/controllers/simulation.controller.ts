import { Body, Controller, Get, HttpCode, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { CurrentUser } from "../../auth/controllers/current-user.decorator";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { MILESTONE_ROLES } from "../../milestones/controllers/milestone-roles";
import { toProjectResponse } from "../../projects/controllers/api.mappers";
import { SimulationUseCases } from "../application/simulation.use-cases";
import { toPresetResponse, toSimulationResponse } from "./simulation.mappers";
import { parseSimulationRequest } from "./simulation.requests";

const { producer, operator, fiduciaria, investor } = MILESTONE_ROLES;

// RF-06/RF-07/RF-30: the simulation motor's sheet and the offer-rule publication gate. Bodies stay unknown so the global
// ValidationPipe passes them through. ponytail: no swagger DTOs and openapi.yaml not regenerated for these routes yet.
@ApiTags("simulation")
@Controller("api")
@UseGuards(ApiAuthGuard, RolesGuard)
@UseFilters(ApiErrorFilter)
@Roles(producer, operator, fiduciaria, investor)
export class SimulationController {
  constructor(private readonly simulations: SimulationUseCases) {}

  /** The PRD demo projects (P1 not publishable, P2 publishable) the motor starts from */
  @Get("simulation/presets")
  presets() {
    return this.simulations.presets().map(toPresetResponse);
  }

  /** Runs the motor (20.000 scenarios, fixed seed) from a preset plus overrides and stores the run */
  @Post("projects/:projectId/simulation")
  @Roles(producer, operator, fiduciaria)
  @HttpCode(201)
  async run(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return toSimulationResponse(await this.simulations.run(projectId, user, parseSimulationRequest(body)));
  }

  /** The project's latest sheet; 404 when it was never simulated */
  @Get("projects/:projectId/simulation")
  async latest(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return toSimulationResponse(await this.simulations.latest(projectId, user));
  }

  /** DRAFT → FUNDING_IN_PROGRESS when the latest sheet passes the offer rule; 409 { errors: { _form } } otherwise */
  @Post("projects/:projectId/publish")
  @Roles(producer, operator)
  @HttpCode(200)
  async publish(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return toProjectResponse(await this.simulations.publish(projectId, user));
  }
}
