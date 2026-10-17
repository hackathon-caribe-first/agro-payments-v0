import { ClipboardPlus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import {
  LOG_TYPES,
  type EvidencePayload,
  type LogType,
  type RequirementSpec,
} from "@agro/shared/modules/milestones/domain/milestone";
import { Button } from "@agro/shared/ui/button";
import { Checkbox } from "@agro/shared/ui/checkbox";
import { Input } from "@agro/shared/ui/input";
import { Label } from "@agro/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";
import { Textarea } from "@agro/shared/ui/textarea";
import type { ProducerActionResult } from "~/producer/error-copy";

const LOG_TYPE_LABELS: Record<LogType, string> = {
  PHOTO_EVIDENCE: "Evidencia fotográfica",
  SOIL_ANALYSIS: "Análisis de suelo",
  IOT_READING: "Lectura de sensor",
  WEATHER_ALERT: "Alerta climática",
  AGRONOMIC_NOTE: "Nota agronómica",
};

type Props = {
  requirements: RequirementSpec[];
  currentData: EvidencePayload;
  photoOptions: readonly string[];
};

const errorId = (id: string) => `${id}-error`;

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={errorId(id)} role="alert" className="text-sm font-semibold text-destructive">
      ✕ {messages.join(" ")}
    </p>
  );
}

function RequirementField({
  requirement,
  currentData,
  photoOptions,
  errors,
}: {
  requirement: RequirementSpec;
  currentData: EvidencePayload;
  photoOptions: readonly string[];
  errors?: string[];
}) {
  const { fieldKey, label } = requirement;
  const id = `field-${fieldKey}`;
  const current = currentData[fieldKey];

  switch (requirement.type) {
    case "number":
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input
            id={id}
            name={fieldKey}
            type="number"
            step="any"
            min={requirement.min}
            max={requirement.max}
            defaultValue={typeof current === "number" ? current : undefined}
            aria-invalid={errors ? true : undefined}
            aria-describedby={errors ? errorId(id) : undefined}
          />
          <FieldError id={id} messages={errors} />
        </div>
      );
    case "boolean_system_check":
      return (
        <div className="flex flex-col gap-1.5">
          <input type="hidden" name={fieldKey} value="false" />
          <div className="flex items-center gap-2">
            <Checkbox
              id={id}
              name={fieldKey}
              value="true"
              defaultChecked={current === true}
              aria-invalid={errors ? true : undefined}
              aria-describedby={errors ? errorId(id) : undefined}
            />
            <Label htmlFor={id}>{label}</Label>
          </div>
          <FieldError id={id} messages={errors} />
        </div>
      );
    case "photo_array": {
      const selected = Array.isArray(current) ? current : [];
      return (
        <fieldset
          className="flex flex-col gap-2"
          aria-invalid={errors ? true : undefined}
          aria-describedby={errors ? errorId(id) : undefined}
        >
          <legend className="text-sm font-medium">
            {label} <span className="text-muted-foreground">(mínimo {requirement.minItems})</span>
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {photoOptions.map((url) => (
              <div key={url} className="flex items-center gap-2">
                <Checkbox id={`${id}-${url}`} name={fieldKey} value={url} defaultChecked={selected.includes(url)} />
                <Label htmlFor={`${id}-${url}`} className="break-all text-sm">
                  {url.split("/").pop()}
                </Label>
              </div>
            ))}
          </div>
          <FieldError id={id} messages={errors} />
        </fieldset>
      );
    }
  }
}

// Each log carries every required field, prefilled with the latest recorded values.
export function EvidenceForm({ requirements, currentData, photoOptions }: Props) {
  const fetcher = useFetcher<ProducerActionResult>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data && !fetcher.data.ok ? fetcher.data : null;
  const fieldErrors = result?.fieldErrors ?? {};
  const saved = fetcher.data?.ok === true;
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Focus the first invalid control after a failed save.
  useEffect(() => {
    if (!result) return;
    const frame = requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('input[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [result]);

  // Notes belong to a single log: clear them once it is saved.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && notesRef.current) notesRef.current.value = "";
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post" ref={formRef} className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="evidence" />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="log-type">Tipo de registro</Label>
        <Select name="logType" defaultValue="PHOTO_EVIDENCE">
          <SelectTrigger
            id="log-type"
            className="w-full"
            aria-invalid={fieldErrors.logType ? true : undefined}
            aria-describedby={fieldErrors.logType ? errorId("log-type") : undefined}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOG_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {LOG_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="log-type" messages={fieldErrors.logType} />
      </div>

      {requirements.map((r) => (
        <RequirementField
          key={r.fieldKey}
          requirement={r}
          currentData={currentData}
          photoOptions={photoOptions}
          errors={fieldErrors[`evidencePayload.${r.fieldKey}`]}
        />
      ))}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="log-notes">Notas</Label>
        <Textarea
          ref={notesRef}
          id="log-notes"
          name="notes"
          rows={3}
          maxLength={1000}
          aria-invalid={fieldErrors.notes ? true : undefined}
          aria-describedby={fieldErrors.notes ? errorId("log-notes") : undefined}
        />
        <FieldError id="log-notes" messages={fieldErrors.notes} />
      </div>

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <ClipboardPlus aria-hidden="true" />
        {pending ? "Guardando…" : "Guardar registro"}
      </Button>
      {result && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          ✕ {result.message}
        </p>
      )}
      {saved && !pending && <p className="text-sm font-semibold text-success">✓ Registro guardado.</p>}
    </fetcher.Form>
  );
}
