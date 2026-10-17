import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { NotificationsController, toNotificationResponse } from "./notifications.controller";

const meta = (key: string, handler?: string) =>
  Reflect.getMetadata(key, handler ? (NotificationsController.prototype as unknown as Record<string, object>)[handler] : NotificationsController);

describe("NotificationsController (RF-37)", () => {
  it("serves the session user's notices and mark-read under /api/notifications, for any signed-in role", () => {
    expect(meta(GUARDS_METADATA)).toEqual([ApiAuthGuard]);
    expect([RequestMethod[meta(METHOD_METADATA, "list")], meta(PATH_METADATA), meta(PATH_METADATA, "list")]).toEqual(["GET", "api/notifications", "/"]);
    expect([RequestMethod[meta(METHOD_METADATA, "markRead")], meta(PATH_METADATA, "markRead")]).toEqual(["POST", ":id/read"]);
  });

  it("speaks snake_case", () => {
    expect(
      toNotificationResponse({
        id: "n1",
        recipientUserId: "u",
        recipientRole: null,
        kind: "payment_done",
        title: "Pago hecho",
        body: "Le llegaron $1",
        projectId: "p",
        milestoneId: "m",
        payload: {},
        createdAt: new Date("2026-10-17T00:00:00Z"),
        readAt: null,
      }),
    ).toEqual({ id: "n1", kind: "payment_done", title: "Pago hecho", body: "Le llegaron $1", project_id: "p", milestone_id: "m", payload: {}, created_at: "2026-10-17T00:00:00.000Z", read_at: null });
  });
});
