import { data } from "react-router";
import { NOTIFICATION_ROLES, type NotificationRole } from "@agro/shared/modules/reviews/domain/review";
import { currentSession } from "~/auth/guard";
import { NotificationList } from "~/components/review/notification-list";
import { reviewErrorMessage } from "~/reviews/error-copy";
import { reviews } from "~/reviews/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/ops.notifications";

export const meta = () => [{ title: "Notificaciones · Surco" }];

const ROLE_TITLES: Record<NotificationRole, string> = {
  PRODUCER: "Productor",
  INVESTOR: "Inversor",
  VERIFIER: "Verificador",
};

// RF-18 + RNF-07: the notifications of the signed-in role only (producer, investor or verifier). The role never comes from the URL.
async function ownRole(): Promise<NotificationRole> {
  const session = await currentSession();
  const role = NOTIFICATION_ROLES.find((r) => r === session?.role);
  if (!role) throw new Response("Forbidden", { status: 403 });
  return role;
}

export async function clientLoader() {
  const role = await ownRole();
  const result = await reviews.listNotifications(role);
  if (!result.ok) throw data(reviewErrorMessage(result.error), { status: 502 });
  return { role, notifications: result.value };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  const role = await ownRole();
  if (form.get("intent") === "read") {
    // Only a notification of the signed-in role can be marked as read.
    const own = await reviews.listNotifications(role);
    const id = String(form.get("notificationId") ?? "");
    if (!own.ok || !own.value.some((n) => n.id === id)) return { ok: false };
    const result = await reviews.markNotificationRead(id);
    return { ok: result.ok };
  }
  if (form.get("intent") === "read-all") {
    const result = await reviews.markAllNotificationsRead(role);
    return { ok: result.ok };
  }
  return { ok: false };
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { role, notifications } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Notificaciones</h1>
        <p className="mt-2 max-w-prose text-pretty text-muted-foreground">
          Cada cambio de estado de un hito, dictamen o pago llega aquí. Estos son los avisos de tu perfil ({ROLE_TITLES[role]}).
        </p>
      </header>
      <NotificationList notifications={notifications} role={role} />
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <>
      <h1 className="text-2xl text-primary">No pudimos cargar tus notificaciones</h1>
      <p className="mt-2 text-muted-foreground">Revisa tu conexión y vuelve a intentarlo.</p>
      <a href="" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Reintentar
      </a>
    </>
  );
}
