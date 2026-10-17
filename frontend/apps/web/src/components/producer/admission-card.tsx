import { StatusBadge } from "@agro/shared/ui/status-badge";
import type { Admission } from "~/producer/admission";

const LEVEL_LABEL: Record<Admission["level"], string> = { A: "Nivel A", B: "Nivel B", C: "Nivel C", primer_ciclo: "Primer ciclo" };

const financeable = (pct: Admission["financeable_pct"]) => {
  if (!pct) return "Monto pequeño, en grupo";
  return pct.min === null ? `Hasta ${pct.max} %` : `${pct.min}–${pct.max} %`;
};

// RF-02/RF-03: the nine elimination filters (binary) and the A15 score → level → milestones, financeable % and jornales line.
export function AdmissionCard({ admission }: { admission: Admission | null }) {
  if (!admission) {
    return (
      <section aria-labelledby="admission-heading" className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <h2 id="admission-heading" className="text-lg text-primary">
          Admisión
        </h2>
        <p className="text-muted-foreground">Todavía no se han revisado los filtros ni el puntaje de este proyecto.</p>
      </section>
    );
  }
  const rows: [string, string][] = [
    ["Puntaje", `${admission.score} / 100`],
    ["Hitos", admission.milestones === null ? "En especie" : String(admission.milestones)],
    ["Financiable", financeable(admission.financeable_pct)],
    ["Línea de jornales", admission.labor_line ? "Sí" : "No: pago en especie"],
  ];
  return (
    <section aria-labelledby="admission-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="admission-heading" className="text-lg text-primary">
          Admisión
        </h2>
        {admission.admitted ? (
          <StatusBadge label={LEVEL_LABEL[admission.level]} tone="success" symbol="✓" />
        ) : (
          <StatusBadge label="No admitido" tone="danger" symbol="✕" />
        )}
      </div>
      {admission.admitted ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="text-sm">
          <p className="font-semibold text-destructive">No pasó estos filtros:</p>
          <ul className="mt-1 list-disc pl-5">
            {admission.failed_filters.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-primary">Ver los 9 filtros y su evidencia</summary>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {admission.filters.map((f) => (
            <li key={f.name}>
              <span aria-hidden="true">{f.passes ? "✓ " : "✕ "}</span>
              <span className="font-semibold">{f.name}</span>
              <span className="sr-only">{f.passes ? " (cumple)" : " (no cumple)"}</span>
              <span className="block text-muted-foreground">{f.evidence}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
