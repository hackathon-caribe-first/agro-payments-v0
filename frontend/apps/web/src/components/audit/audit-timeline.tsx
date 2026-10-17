import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import {
  ACTOR_ROLE_LABEL,
  AUDIT_TYPES,
  AUDIT_TYPE_LABEL,
  LINK_LABEL,
  auditHref,
  countByType,
  filterAudit,
  type AuditEntry,
  type AuditTimeline,
  type AuditType,
  type AuditViewer,
} from "@agro/shared/modules/audit/domain/audit";
import { Button } from "@agro/shared/ui/button";
import { formatDateTime } from "~/components/presale/format";

function EntryItem({ entry, viewer }: { entry: AuditEntry; viewer: AuditViewer }) {
  const href = auditHref(entry.link, viewer);
  return (
    <li className="flex flex-col gap-1 border-l-2 border-primary/30 py-1 pl-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 break-words font-semibold">{entry.title}</p>
        <p className="text-sm text-muted-foreground">
          <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {entry.actorName} · {ACTOR_ROLE_LABEL[entry.actorRole]} · {AUDIT_TYPE_LABEL[entry.type]}
      </p>
      {(entry.from || entry.to) && (
        <p className="text-sm">
          <span className="text-muted-foreground">{entry.from ?? "Sin estado previo"}</span>
          <span aria-label="pasa a"> → </span>
          <span className="font-semibold">{entry.to ?? "Sin estado"}</span>
        </p>
      )}
      {entry.cause && <p className="text-sm">{entry.cause}</p>}
      {entry.link && href && (
        <Link to={href} className="inline-flex items-center gap-1 self-start text-sm font-bold text-primary underline underline-offset-4">
          {LINK_LABEL[entry.link.kind]}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      )}
    </li>
  );
}

// Read-only, chronological trail. The filter only hides entries on screen; nothing here can edit or remove one.
export function AuditTimelineView({ timeline, viewer }: { timeline: AuditTimeline; viewer: AuditViewer }) {
  const [selected, setSelected] = useState<AuditType[]>([]);
  const counts = countByType(timeline.entries);
  const visible = filterAudit(timeline.entries, selected);
  const available = [...AUDIT_TYPES, "UNKNOWN" as const].filter((t) => counts[t] > 0);

  const toggle = (type: AuditType) => setSelected((cur) => (cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type]));

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Filtrar por tipo de evento" className="flex flex-wrap gap-2">
        <Button type="button" size="compact" variant={selected.length === 0 ? "default" : "outline"} aria-pressed={selected.length === 0} onClick={() => setSelected([])}>
          Todos ({timeline.entries.length})
        </Button>
        {available.map((type) => (
          <Button key={type} type="button" size="compact" variant={selected.includes(type) ? "default" : "outline"} aria-pressed={selected.includes(type)} onClick={() => toggle(type)}>
            {AUDIT_TYPE_LABEL[type]} ({counts[type]})
          </Button>
        ))}
      </div>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {visible.length === 1 ? "1 evento" : `${visible.length} eventos`}, del más antiguo al más reciente. Los registros no se pueden editar ni borrar.
      </p>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay eventos registrados para este filtro.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {visible.map((entry) => (
            <EntryItem key={entry.id} entry={entry} viewer={viewer} />
          ))}
        </ol>
      )}
    </div>
  );
}
