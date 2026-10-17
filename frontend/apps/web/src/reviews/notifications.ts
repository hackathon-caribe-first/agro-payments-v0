import { unreadCount } from "@agro/shared/modules/reviews/application/use-cases";
import type { NotificationRole } from "@agro/shared/modules/reviews/domain/review";
import { reviews } from "./module";

// Badge helper for any layout: resolves to the number of unread notifications of a role (0 when the request fails,
// so a broken badge never blocks a page).
export async function loadUnreadCount(role: NotificationRole): Promise<number> {
  const result = await reviews.listNotifications(role);
  return result.ok ? unreadCount(result.value) : 0;
}
