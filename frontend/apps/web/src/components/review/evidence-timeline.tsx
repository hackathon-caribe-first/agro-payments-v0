import { ExternalLink, MapPin } from "lucide-react";
import type { EvidenceLog, EvidenceValue, RequirementSpec } from "@agro/shared/modules/milestones/domain/milestone";
import type { PhotoMeta } from "@agro/shared/modules/reviews/domain/review";
import { LOG_TYPE_LABELS, formatCoordinate, formatDateTime } from "./format";

function PhotoList({ urls, meta }: { urls: string[]; meta: Record<string, PhotoMeta> }) {
  return (
    <ul className="flex flex-col gap-2">
      {urls.map((url, index) => {
        const gps = meta[url];
        return (
          <li key={url} className="rounded-sm border bg-background p-2 text-sm">
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary underline underline-offset-4">
              Foto {index + 1}
              <ExternalLink aria-hidden="true" className="size-3.5" />
              <span className="sr-only">(se abre en una pestaña nueva)</span>
            </a>
            {gps ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-muted-foreground">
                <MapPin aria-hidden="true" className="size-3.5" />
                <span className="tabular-nums">
                  GPS {formatCoordinate(gps.lat)}, {formatCoordinate(gps.lng)}
                </span>
                <span>precisión ±{String(gps.accuracyMeters).replace(".", ",")} m</span>
                <span>capturada el {formatDateTime(gps.capturedAt)}</span>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lng}#map=17/${gps.lat}/${gps.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  Ver en el mapa<span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">Sin datos de ubicación.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PayloadValue({ value, meta }: { value: EvidenceValue; meta: Record<string, PhotoMeta> }) {
  if (Array.isArray(value)) return <PhotoList urls={value} meta={meta} />;
  if (typeof value === "boolean") return <span>{value ? "✓ Cumple" : "✕ No cumple"}</span>;
  return <span className="tabular-nums">{String(value).replace(".", ",")}</span>;
}

// Field logs of the milestone, oldest first: the story the verifier has to check.
export function EvidenceTimeline({ logs, requirements, photoMeta }: { logs: EvidenceLog[]; requirements: RequirementSpec[]; photoMeta: Record<string, PhotoMeta> }) {
  const labelOf = (key: string) => requirements.find((r) => r.fieldKey === key)?.label ?? key;
  const ordered = [...logs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
      <h2 id="timeline-heading" className="text-lg text-primary">
        Bitácora y evidencia de campo
      </h2>
      {ordered.length === 0 ? (
        <p className="text-muted-foreground">El productor no registró evidencia para este hito.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {ordered.map((log) => (
            <li key={log.id} className="rounded-md border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{LOG_TYPE_LABELS[log.logType]}</p>
                <p className="text-sm text-muted-foreground">{formatDateTime(log.createdAt)}</p>
              </div>
              {log.notes && <p className="mt-1">{log.notes}</p>}
              <dl className="mt-2 flex flex-col gap-2 text-sm">
                {Object.entries(log.evidencePayload).map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <dt className="text-muted-foreground">{labelOf(key)}</dt>
                    <dd>
                      <PayloadValue value={value} meta={photoMeta} />
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
