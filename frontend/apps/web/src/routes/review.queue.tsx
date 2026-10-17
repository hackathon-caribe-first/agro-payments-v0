import { Bell } from "lucide-react";
import { Link, data } from "react-router";
import { QUEUE_TABS, type QueueTab } from "@agro/shared/modules/reviews/domain/review";
import { Button } from "@agro/shared/ui/button";
import { QueueCard } from "~/components/review/queue-card";
import { reviewErrorMessage } from "~/reviews/error-copy";
import { reviews } from "~/reviews/module";
import type { Route } from "./+types/review.queue";

export const meta = () => [{ title: "Verificaciones · Surco" }];

const TAB_LABELS: Record<QueueTab, string> = {
  pending: "Por dictaminar",
  changes: "Observados",
  decided: "Decididos",
};

const EMPTY_COPY: Record<QueueTab, string> = {
  pending: "No tienes hitos por dictaminar. Cuando un productor envíe un hito a revisión aparecerá aquí.",
  changes: "No hay hitos observados esperando correcciones del productor.",
  decided: "Aún no has emitido dictámenes aprobados.",
};

const parseTab = (value: string | null): QueueTab => (QUEUE_TABS as readonly (string | null)[]).includes(value) ? (value as QueueTab) : "pending";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const tab = parseTab(new URL(request.url).searchParams.get("tab"));
  const result = await reviews.listQueue(tab);
  if (!result.ok) throw data(reviewErrorMessage(result.error), { status: 502 });
  return { tab, items: result.value };
}

export default function ReviewQueue({ loaderData }: Route.ComponentProps) {
  const { tab, items } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-primary">Verificaciones</h1>
          <p className="mt-2 text-muted-foreground">Inspecciona la evidencia de cada hito y emite tu dictamen: aprobado u observado.</p>
        </div>
        <Button asChild variant="outline" size="compact">
          <Link to="/verifier/notifications">
            <Bell aria-hidden="true" />
            Notificaciones
          </Link>
        </Button>
      </header>

      <nav aria-label="Estado de las verificaciones" className="flex flex-wrap gap-2">
        {QUEUE_TABS.map((value) => (
          <Button key={value} asChild variant={value === tab ? "default" : "outline"} size="compact">
            <Link to={value === "pending" ? "/verifier/reviews" : `/verifier/reviews?tab=${value}`} aria-current={value === tab ? "page" : undefined} preventScrollReset>
              {TAB_LABELS[value]}
            </Link>
          </Button>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">{EMPTY_COPY[tab]}</p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {items.map((item) => (
            <QueueCard key={item.milestoneId} item={item} tab={tab} />
          ))}
        </ul>
      )}
    </div>
  );
}
