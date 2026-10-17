// Unread counter for nav entries or headers. Renders nothing when there is nothing unread. The layout owner decides where to
// mount it; the count comes from `loadUnreadCount` (apps/web/src/reviews/notifications.ts).
export function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{count} notificaciones sin leer</span>
    </span>
  );
}
