import { ClipboardCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { ADMISSION_BLOCKS, ELIMINATION_FILTERS, EVIDENCE_MAX_LENGTH, type FilterAnswer } from "@agro/shared/modules/simulation/domain/admission";
import { blockField, filterField } from "@agro/shared/modules/simulation/schemas/admission-form";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Label } from "@agro/shared/ui/label";
import { Textarea } from "@agro/shared/ui/textarea";
import { FieldError, invalidProps } from "~/components/producer/project-form/field-error";
import { ADMISSION_INTENT, LEVEL_LABEL, financeableLabel, type Admission, type AdmissionActionData } from "~/producer/admission";

const domId = (name: string) => `admission-${name.replaceAll(".", "-")}`;

function FilterQuestion({ index, name, previous, errors }: { index: number; name: string; previous?: FilterAnswer; errors: Record<string, string[]> }) {
  const passesName = filterField(index, "passes");
  const evidenceName = filterField(index, "evidence");
  const passesId = domId(passesName);
  const evidenceId = domId(evidenceName);
  const options = [
    { value: "true", label: "Pasa el filtro", symbol: "✓" },
    { value: "false", label: "No pasa", symbol: "✕" },
  ];
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <fieldset className="flex flex-col gap-2" {...invalidProps(passesId, errors[passesName])}>
        <legend className="font-semibold">
          {index + 1}. {name}
        </legend>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <label
              key={o.value}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 border-input px-3 text-sm font-semibold has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input
                type="radio"
                name={passesName}
                value={o.value}
                defaultChecked={previous ? String(previous.passes) === o.value : undefined}
                className="size-4 accent-primary"
              />
              <span aria-hidden="true">{o.symbol}</span>
              {o.label}
            </label>
          ))}
        </div>
        <FieldError id={passesId} messages={errors[passesName]} />
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={evidenceId}>Evidencia</Label>
        <Textarea
          id={evidenceId}
          name={evidenceName}
          rows={2}
          maxLength={EVIDENCE_MAX_LENGTH}
          defaultValue={previous?.evidence}
          placeholder="Ejemplo: consulta en listas del 12 de octubre, sin coincidencias."
          {...invalidProps(evidenceId, errors[evidenceName])}
        />
        <FieldError id={evidenceId} messages={errors[evidenceName]} />
      </div>
    </li>
  );
}

function AssessedSummary({ admission }: { admission: Admission }) {
  if (!admission.admitted) {
    return (
      <p role="status" className="text-sm font-semibold text-destructive">
        ✕ No admitido: no pasó {admission.failed_filters.length === 1 ? "el filtro" : "los filtros"} {admission.failed_filters.join(", ")}.
        Puntaje 0 / 100, nivel {LEVEL_LABEL[admission.level]}.
      </p>
    );
  }
  return (
    <p role="status" className="text-sm font-semibold text-success">
      ✓ Evaluación guardada: {LEVEL_LABEL[admission.level]} · <span className="tabular-nums">{admission.score} / 100</span> ·{" "}
      {admission.milestones === null ? "hitos en especie" : `${admission.milestones} hitos`} · financiable{" "}
      <span className="tabular-nums">{financeableLabel(admission.financeable_pct)}</span> · línea de jornales{" "}
      {admission.labor_line ? "sí" : "no"}.
    </p>
  );
}

// RF-02/RF-03: nine elimination filters (pass/fail + evidence) and the seven A15 blocks. Prefilled with the latest admission.
function AdmissionForm({ projectId, previous }: { projectId: string; previous: Admission | null }) {
  const fetcher = useFetcher<AdmissionActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const pending = fetcher.state !== "idle";
  const errors = fetcher.data && !fetcher.data.ok ? fetcher.data.fieldErrors : {};
  const assessed = fetcher.data?.ok ? fetcher.data.admission : null;

  // Move focus to the first field the producer has to fix.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || fetcher.data.ok) {
      return;
    }
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"] input, textarea[aria-invalid="true"], input[aria-invalid="true"]')?.focus();
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form ref={formRef} method="post" noValidate className="flex flex-col gap-5">
      <input type="hidden" name="intent" value={ADMISSION_INTENT} />
      <input type="hidden" name="projectId" value={projectId} />

      <fieldset className="flex flex-col gap-3">
        <legend className="font-brand text-base font-bold text-primary">Filtros de eliminación</legend>
        <p className="text-sm text-muted-foreground">
          Pasa el filtro quiere decir que el proyecto no tiene esa restricción. Un solo filtro sin pasar deja el proyecto por fuera.
        </p>
        <ol className="flex flex-col gap-3">
          {ELIMINATION_FILTERS.map((name, i) => (
            <FilterQuestion key={name} index={i} name={name} previous={previous?.filters[i]} errors={errors} />
          ))}
        </ol>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-brand text-base font-bold text-primary">Puntaje por bloque</legend>
        <p className="text-sm text-muted-foreground">Califica cada bloque de 0 a 100. El peso dice cuánto cuenta en el puntaje total.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {ADMISSION_BLOCKS.map((b) => {
            const name = blockField(b.key);
            const id = domId(name);
            return (
              <div key={b.key} className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id}>
                  {b.label} <span className="font-normal text-muted-foreground tabular-nums">· peso {b.weight} %</span>
                </Label>
                <Input
                  id={id}
                  name={name}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="any"
                  defaultValue={previous?.blocks[b.key]}
                  className="h-11 tabular-nums"
                  {...invalidProps(id, errors[name])}
                />
                <FieldError id={id} messages={errors[name]} />
              </div>
            );
          })}
        </div>
      </fieldset>

      {errors[FORM_LEVEL_KEY] && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          ✕ {errors[FORM_LEVEL_KEY].join(" ")}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        <ClipboardCheck aria-hidden="true" />
        {pending ? "Calculando…" : "Calcular admisión"}
      </Button>
      {assessed && !pending && <AssessedSummary admission={assessed} />}
    </fetcher.Form>
  );
}

// Collapsed once the project has an admission. The form keeps its place in the tree, so the result of a submission stays
// visible after the page revalidates with the new admission.
export function AdmissionSection({ projectId, admission }: { projectId: string; admission: Admission | null }) {
  const [open, setOpen] = useState(admission === null);
  return (
    <section aria-labelledby="admission-form-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 id="admission-form-heading" className="text-lg text-primary">
        Evaluar admisión
      </h2>
      <p className="text-sm text-muted-foreground">
        Responde los 9 filtros con su evidencia y califica los 7 bloques. El resultado define el nivel, los hitos, el porcentaje
        financiable y si hay línea de jornales.
      </p>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
          {admission ? "Volver a evaluar los filtros y el puntaje" : "Llenar la evaluación"}
        </summary>
        <div className="pt-3">
          <AdmissionForm projectId={projectId} previous={admission} />
        </div>
      </details>
    </section>
  );
}
