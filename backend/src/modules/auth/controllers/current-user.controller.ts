import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuthenticatedUser } from "../ports/session-resolver";
import { AuthGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { CurrentUserResponseDto } from "./dtos/current-user.response.dto";

// Lives under /users, outside the catch-all /api/auth/* route owned by Better Auth.
@ApiTags("users")
@Controller("users")
@UseGuards(AuthGuard)
export class CurrentUserController {
  /** Get the authenticated user */
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): CurrentUserResponseDto {
    return user;
  }
}
