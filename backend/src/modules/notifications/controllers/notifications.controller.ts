import { Controller, Get, HttpCode, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { CurrentUser } from "../../auth/controllers/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import type { Notification } from "../application/notifications";
import { NotificationsService } from "../application/notifications";

export const toNotificationResponse = (n: Notification) => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  project_id: n.projectId,
  milestone_id: n.milestoneId,
  payload: n.payload,
  created_at: n.createdAt.toISOString(),
  read_at: n.readAt?.toISOString() ?? null,
});

// RF-37: the session user's notices (their own plus their role's). Any signed-in role; with DEMO_IDENTITY and no session,
// ApiAuthGuard answers as the demo producer, so the web bell shows the producer's notices (the demo's main recipient).
// ponytail: no swagger DTOs and openapi.yaml not regenerated for these routes yet.
@ApiTags("notifications")
@Controller("api/notifications")
@UseGuards(ApiAuthGuard)
@UseFilters(ApiErrorFilter)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Newest first, at most 50 */
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return (await this.notifications.list(user)).map(toNotificationResponse);
  }

  /** Marks one read; another user's notice is a 404 */
  @Post(":id/read")
  @HttpCode(200)
  async markRead(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return toNotificationResponse(await this.notifications.markRead(id, user));
  }
}
