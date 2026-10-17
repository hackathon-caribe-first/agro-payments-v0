import { ClipboardPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import {
  LOG_TYPES,
  type EvidenceLocation,
  type EvidencePayload,
  type LogType,
  type RequirementSpec,
} from "@agro/shared/modules/milestones/domain/milestone";
import { errorsUnder } from "@agro/shared/modules/milestones/schemas/evidence-log";
import { Button } from "@agro/shared/ui/button";
import { Checkbox } from "@agro/shared/ui/checkbox";
import { Input } from "@agro/shared/ui/input";
import { Label } from "@agro/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";
import { Textarea } from "@agro/shared/ui/textarea";
import type { ProducerActionResult } from "~/producer/error-copy";
import { LocationField, PhotoHashPicker, type PhotoHashes } from "./evidence-attestation";

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

type HashProps = {
  hashes: PhotoHashes;
  onHash: (url: string, sha256: string | null) => void;
  hashErrors?: string[];
};

function RequirementField({
  requirement,
  currentData,
  photoOptions,
  errors,
  ...hashProps
}: {
  requirement: RequirementSpec;
  currentData: EvidencePayload;
  photoOptions: readonly string[];
  errors?: string[];
} & HashProps) {
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
    case "photo_array":
      return (
        <PhotoArrayField
          id={id}
          fieldKey={fieldKey}
          label={label}
          minItems={requirement.minItems}
          initial={Array.isArray(current) ? current : []}
          photoOptions={photoOptions}
          errors={errors}
          {...hashProps}
        />
      );
  }
}

// RF-19/RF-35: each selected photo can carry its sha256. ponytail: there is no upload service yet, so the photo URL still
// comes from the fixed options; the producer picks the local file only so the browser can fingerprint it.
function PhotoArrayField({
  id,
  fieldKey,
  label,
  minItems,
  initial,
  photoOptions,
  errors,
  hashes,
  onHash,
  hashErrors,
}: {
  id: string;
  fieldKey: string;
  label: string;
  minItems: number;
  initial: readonly string[];
  photoOptions: readonly string[];
  errors?: string[];
} & HashProps) {
  const [selected, setSelected] = useState<readonly string[]>(initial);
  const toggle = (url: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, url] : prev.filter((u) => u !== url)));
    if (!checked) onHash(url, null);
  };
  const hashErrorId = `${id}-hashes`;
  const describedBy = [errors && errorId(id), hashErrors && errorId(hashErrorId)].filter(Boolean).join(" ");
  return (
    <fieldset className="flex flex-col gap-2" aria-invalid={describedBy ? true : undefined} aria-describedby={describedBy || undefined}>
      <legend className="text-sm font-medium">
        {label} <span className="text-muted-foreground">(mínimo {minItems})</span>
      </legend>
      <p className="text-sm text-muted-foreground">
        Opcional: por cada foto marcada, elige el archivo en tu dispositivo para calcular su huella. La foto no se sube; la huella
        sirve para probar que no cambió.
      </p>
      <ul className="flex flex-col gap-2">
        {photoOptions.map((url) => {
          const checked = selected.includes(url);
          return (
            <li key={url} className="flex flex-col gap-2 rounded-md border p-2">
              <div className="flex min-h-11 items-center gap-2">
                <Checkbox
                  id={`${id}-${url}`}
                  name={fieldKey}
                  value={url}
                  defaultChecked={initial.includes(url)}
                  onCheckedChange={(state) => toggle(url, state === true)}
                />
                <Label htmlFor={`${id}-${url}`} className="break-all text-sm">
                  {url.split("/").pop()}
                </Label>
              </div>
              {checked && <PhotoHashPicker url={url} sha256={hashes[url]} onHash={onHash} />}
            </li>
          );
        })}
      </ul>
      <FieldError id={id} messages={errors} />
      <FieldError id={hashErrorId} messages={hashErrors} />
    </fieldset>
  );
}

// Each log carries every required field, prefilled with the latest recorded values.
export function EvidenceForm({ requirements, currentData, photoOptions }: Props) {
  const fetcher = useFetcher<ProducerActionResult>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data && !fetcher.data.ok ? fetcher.data : null;
  const fieldErrors = result?.fieldErrors ?? {};
  const saved = fetcher.data?.ok === true;
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [location, setLocation] = useState<EvidenceLocation | null>(null);
  const [hashes, setHashes] = useState<PhotoHashes>({});
  const setHash = (url: string, sha256: string | null) =>
    setHashes((prev) => {
      const { [url]: _previous, ...rest } = prev;
      return sha256 === null ? rest : { ...rest, [url]: sha256 };
    });
  const formRef = useRef<HTMLFormElement>(null);

  // Focus the first invalid control after a failed save.
  useEffect(() => {
    if (!result) return;
    const frame = requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('input[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [result]);

  // Notes, location and photo hashes belong to a single log: clear them once it is saved.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok) {
      return;
    }
    if (notesRef.current) notesRef.current.value = "";
    setLocation(null);
    setHashes({});
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
          hashes={hashes}
          onHash={setHash}
          hashErrors={errorsUnder(fieldErrors, "photoHashes")}
        />
      ))}
      {Object.entries(hashes).map(([url, sha256]) => (
        <div key={url} hidden>
          <input type="hidden" name="photoHashUrl" value={url} />
          <input type="hidden" name="photoHashSha256" value={sha256} />
        </div>
      ))}

      <LocationField location={location} onChange={setLocation} errors={errorsUnder(fieldErrors, "location")} />

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
