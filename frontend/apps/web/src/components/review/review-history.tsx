import type { ReviewEntry } from "@agro/shared/modules/reviews/domain/review";
import { statusLabel } from "~/components/producer/status-label";
import { ROLE_LABELS, VERDICT_LABELS, formatDateTime } from "./format";

function entryTitle(entry: ReviewEntry): string {
  if (entry.verdict) return VERDICT_LABELS[entry.verdict];
  return `Estado: ${statusLabel(entry.toStatus).label}`;
}

// Immutable audit trail of the milestone (RNF-06): actor, transition, comments, evaluation and signature.
export function ReviewHistory({ entries }: { entries: ReviewEntry[] }) {
  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-3">
      <h2 id="history-heading" className="text-lg text-primary">
        Historial de revisiones
      </h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay revisiones para este hito.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => {
            const passed = entry.technicalEvaluation.filter((c) => c.passed).length;
            const needsSignature = entry.actor.role === "VERIFIER" && entry.verdict !== null;
            return (
              <li key={entry.id} className="rounded-md border bg-card p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{entryTitle(entry)}</p>
                  <p className="text-sm text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {entry.actor.name} · {ROLE_LABELS[entry.actor.role]}
                  {entry.fromStatus && ` · ${statusLabel(entry.fromStatus).label} → ${statusLabel(entry.toStatus).label}`}
                </p>
                {entry.comments && <p className="mt-1 whitespace-pre-line">{entry.comments}</p>}
                {entry.subsanaciones.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-semibold">Subsanaciones solicitadas</p>
                    <ul className="list-disc pl-5">
                      {entry.subsanaciones.map((s, i) => (
                        <li key={`${i}-${s}`}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {entry.technicalEvaluation.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-semibold">
                      Evaluación técnica: {passed} de {entry.technicalEvaluation.length} criterios cumplidos
                    </summary>
                    <ul className="mt-1 flex flex-col gap-1">
                      {entry.technicalEvaluation.map((c) => (
                        <li key={c.fieldKey}>
                          <span aria-hidden="true">{c.passed ? "✓" : "✕"}</span> <span className="sr-only">{c.passed ? "Cumple:" : "No cumple:"}</span>
                          <span className="font-semibold">{c.label}</span>: {c.observed}. {c.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {entry.signatureHash ? (
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    Firma SHA-256: <code>{entry.signatureHash}</code>
                  </p>
                ) : (
                  needsSignature && <p className="mt-2 text-xs text-muted-foreground">Registro previo, sin firma digital.</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
