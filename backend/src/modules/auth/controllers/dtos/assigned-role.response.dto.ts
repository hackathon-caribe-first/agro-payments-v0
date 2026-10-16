import { ApiProperty } from "@nestjs/swagger";
import { ROLES, type Role } from "../../ports/role";

export class AssignedRoleResponseDto {
  id: string;

  @ApiProperty({ enum: ROLES })
  role: Role;
}
