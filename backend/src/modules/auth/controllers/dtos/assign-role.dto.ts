import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { ROLES, type Role } from "../../ports/role";

export class AssignRoleDto {
  /** New role for the user */
  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role: Role;
}
