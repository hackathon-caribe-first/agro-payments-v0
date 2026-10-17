import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@agro/shared/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@agro/shared/ui/sheet";
import { type Notice, notifications } from "~/notifications";

const REFRESH_MS = 30_000;
const when = (iso: string) => new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });

// RF-37: the session user's notices (activated, payment done, approved/observed, settlement; escalations for staff).
// Without a server (mock transport) the list stays empty and the bell shows no count.
export function NotificationsBell() {
  const [items, setItems] = useState<Notice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void notifications.list().then((result) => {
        if (!alive) return;
        if (result.ok) {
          setItems(result.value);
          setError(null);
        } else setError(result.message);
      });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const unread = items.filter((n) => !n.read_at).length;
  const label = unread > 0 ? `Avisos: ${unread} sin leer` : "Avisos";

  const markRead = async (notice: Notice) => {
    if (notice.read_at) return;
    const result = await notifications.markRead(notice.id);
    if (result.ok) setItems((all) => all.map((n) => (n.id === notice.id ? result.value : n)));
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon-compact" aria-label={label} className="relative">
          <Bell aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-warning px-1 text-center text-xs font-bold text-warning-foreground tabular-nums">
              {unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-brand text-primary">Avisos</SheetTitle>
          <SheetDescription>Lo que pasó con sus proyectos y pagos.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {error && items.length === 0 && <p className="text-sm text-muted-foreground">{error}</p>}
          {!error && items.length === 0 && <p className="text-muted-foreground">No tiene avisos todavía.</p>}
          <ul className="flex flex-col gap-3">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void markRead(n)}
                  className="flex w-full flex-col gap-1 rounded-md border bg-card p-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-brand font-bold text-primary">{n.title}</span>
                    {!n.read_at && (
                      <span className="rounded-sm bg-warning px-2 py-0.5 text-xs font-semibold text-warning-foreground">
                        <span aria-hidden="true">● </span>Nuevo
                      </span>
                    )}
                  </span>
                  <span className="text-pretty">{n.body}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{when(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
