import type { GrantEvent } from "@agro/shared/modules/grants/domain/grant";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDateTime } from "~/components/presale/format";
import { ACTOR_LABELS, eventCode, eventText } from "./status";

// Append-only audit trail, newest first: what happened, who did it and when.
export function GrantTimeline({ events, currency }: { events: GrantEvent[]; currency: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-primary">Historial del grant</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay eventos.</p>
        ) : (
          <ol className="flex flex-col gap-4 border-l pl-4">
            {events.map((event) => (
              <li key={event.id} className="relative min-w-0">
                <span aria-hidden="true" className="absolute -left-[1.3125rem] top-1.5 size-2.5 rounded-full border bg-card" />
                <p className="text-pretty text-sm" title={eventCode(event)}>{eventText(event, currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {ACTOR_LABELS[event.actor]} · <time dateTime={event.at}>{formatDateTime(event.at)}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
