import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { secondsSince } from "@agro/shared/modules/panel/domain/panel";
import { Button } from "@agro/shared/ui/button";

const TIME = new Intl.DateTimeFormat("es-CO", { timeStyle: "medium" });

// Keeps the page fresh (RNF-08): revalidates the route loader every `everyMs` while the tab is visible, and again as soon as
// the tab comes back. "Actualizado hace X s" ticks every second; the screen-reader copy only changes when new data arrives,
// so it is announced once per refresh instead of once per second.
export function LiveStatus({ generatedAt, everyMs }: { generatedAt: string; everyMs: number }) {
  const revalidator = useLiveRevalidate(everyMs);
  const [now, setNow] = useState(() => Date.parse(generatedAt));

  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [generatedAt]);

  const seconds = secondsSince(generatedAt, now);
  const busy = revalidator.state !== "idle";
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <p>
        <span aria-hidden="true">{busy ? "Actualizando…" : `Actualizado hace ${seconds} s`}</span>
        <span className="sr-only" role="status" aria-live="polite">
          Panel actualizado a las {TIME.format(new Date(generatedAt))}
        </span>
      </p>
      <Button type="button" variant="outline" size="compact" disabled={busy} onClick={() => void revalidator.revalidate()}>
        <RefreshCw aria-hidden="true" className={busy ? "animate-spin" : undefined} />
        Actualizar ahora
      </Button>
    </div>
  );
}

/** The refresh without the status line: revalidates every `everyMs` while the tab is visible, and as soon as it comes back. */
export function useLiveRevalidate(everyMs: number) {
  const revalidator = useRevalidator();
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && revalidator.state === "idle") void revalidator.revalidate();
    };
    const timer = setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [everyMs, revalidator]);
  return revalidator;
}
