import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AssignRoleUseCase } from "../application/assign-role.use-case";
import type { AuthenticatedUser } from "../ports/session-resolver";
import { AuthGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { AssignRoleDto } from "./dtos/assign-role.dto";
import { AssignedRoleResponseDto } from "./dtos/assigned-role.response.dto";
import { Roles } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";

// Lives under /users, outside the catch-all /api/auth/* route owned by Better Auth.
@ApiTags("users")
@Controller("users")
@UseGuards(AuthGuard, RolesGuard)
export class UserRolesController {
  constructor(private readonly assignRole: AssignRoleUseCase) {}

  /** Assign any role to a user (admin only) */
  @Patch(":id/role")
  @Roles("admin")
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AssignRoleDto,
  ): Promise<AssignedRoleResponseDto> {
    return this.assignRole.execute(actor.id, id, dto.role);
  }
}
