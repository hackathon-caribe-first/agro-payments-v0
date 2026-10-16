import { ApiProperty } from "@nestjs/swagger";
import { ROLES, type Role } from "../../ports/role";

export class CurrentUserResponseDto {
  id: string;
  email: string;
  name: string;

  @ApiProperty({ enum: ROLES })
  role: Role;
}
