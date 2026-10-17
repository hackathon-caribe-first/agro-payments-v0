import { Link, data } from "react-router";
import { NOTIFICATION_ROLES, type NotificationRole } from "@agro/shared/modules/reviews/domain/review";
import { Button } from "@agro/shared/ui/button";
import { NotificationList } from "~/components/review/notification-list";
import { reviewErrorMessage } from "~/reviews/error-copy";
import { reviews } from "~/reviews/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/review.notifications";

export const meta = () => [{ title: "Notificaciones · Surco" }];

const ROLE_TITLES: Record<NotificationRole, string> = {
  VERIFIER: "Verificador",
  PRODUCER: "Productor",
  INVESTOR: "Inversor",
};

const parseRole = (value: string | null): NotificationRole =>
  (NOTIFICATION_ROLES as readonly (string | null)[]).includes(value) ? (value as NotificationRole) : "VERIFIER";

// The verifier's notifications by default. `?role=PRODUCER|INVESTOR` shows the feed of another role with the same component.
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const role = parseRole(new URL(request.url).searchParams.get("role"));
  const result = await reviews.listNotifications(role);
  if (!result.ok) throw data(reviewErrorMessage(result.error), { status: 502 });
  return { role, notifications: result.value };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  if (form.get("intent") === "read") {
    const result = await reviews.markNotificationRead(String(form.get("notificationId") ?? ""));
    return { ok: result.ok };
  }
  if (form.get("intent") === "read-all") {
    const result = await reviews.markAllNotificationsRead(parseRole(String(form.get("role") ?? "")));
    return { ok: result.ok };
  }
  return { ok: false };
}

export default function ReviewNotifications({ loaderData }: Route.ComponentProps) {
  const { role, notifications } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-primary">Notificaciones</h1>
          <p className="mt-2 text-muted-foreground">Cambios de estado de los hitos · {ROLE_TITLES[role]}.</p>
        </div>
        <Button asChild variant="outline" size="compact">
          <Link to="/verifier/reviews">Ir a verificaciones</Link>
        </Button>
      </header>
      <NotificationList notifications={notifications} role={role} />
    </div>
  );
}
