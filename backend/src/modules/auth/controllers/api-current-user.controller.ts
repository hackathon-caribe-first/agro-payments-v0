import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { toSessionProfile } from "../application/session-profile";
import type { AuthenticatedUser } from "../ports/session-resolver";
import { AuthGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { SessionProfileResponseDto } from "./dtos/session-profile.response.dto";

// The web app's session (sign-in page, layout guard). Under /api so the Vite /api proxy forwards the session cookie;
// /users/me stays as it is for the existing clients.
@ApiTags("users")
@Controller("api/users")
@UseGuards(AuthGuard)
export class ApiCurrentUserController {
  /** Get the signed-in user in the web app's role model */
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): SessionProfileResponseDto {
    return toSessionProfile(user);
  }
}
