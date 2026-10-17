import { BellOff, CheckCheck } from "lucide-react";
import { Link, useFetcher } from "react-router";
import type { Notification, NotificationRole } from "@agro/shared/modules/reviews/domain/review";
import { unreadCount } from "@agro/shared/modules/reviews/application/use-cases";
import { Button } from "@agro/shared/ui/button";
import { formatDateTime } from "./format";

function NotificationItem({ notification }: { notification: Notification }) {
  const fetcher = useFetcher();
  const unread = notification.readAt === null;
  return (
    <li className="flex flex-col gap-1 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {unread && (
            <span className="mr-2 rounded-sm bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
              <span aria-hidden="true">● </span>Sin leer
            </span>
          )}
          {notification.title}
        </p>
        <p className="text-sm text-muted-foreground">{formatDateTime(notification.createdAt)}</p>
      </div>
      <p>{notification.body}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {notification.href && (
          <Link to={notification.href} className="text-sm font-bold text-primary underline underline-offset-4">
            Ver hito
          </Link>
        )}
        {unread && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="read" />
            <input type="hidden" name="notificationId" value={notification.id} />
            <Button type="submit" variant="ghost" size="compact" disabled={fetcher.state !== "idle"}>
              Marcar como leída
            </Button>
          </fetcher.Form>
        )}
      </div>
    </li>
  );
}

// Reusable in-app notification list (RF-18). The hosting route supplies the loader and an action that understands the
// intents `read` (field notificationId) and `read-all` (field role).
export function NotificationList({ notifications, role }: { notifications: Notification[]; role: NotificationRole }) {
  const fetcher = useFetcher();
  const unread = unreadCount(notifications);
  return (
    <section aria-labelledby="notifications-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="notifications-heading" className="text-lg text-primary">
          {unread > 0 ? `${unread} sin leer` : "Todo al día"}
        </h2>
        {unread > 0 && (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="read-all" />
            <input type="hidden" name="role" value={role} />
            <Button type="submit" variant="outline" size="compact" disabled={fetcher.state !== "idle"}>
              <CheckCheck aria-hidden="true" />
              Marcar todas como leídas
            </Button>
          </fetcher.Form>
        )}
      </div>
      {notifications.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border bg-card p-5 text-muted-foreground">
          <BellOff aria-hidden="true" className="size-4" />
          No tienes notificaciones por ahora.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} />
          ))}
        </ul>
      )}
    </section>
  );
}
