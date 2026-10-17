import { z } from "zod";
import { FORM_LEVEL_KEY, type FieldErrors } from "../domain/errors";
import { LOG_TYPES, type EvidenceLocation, type EvidencePayload, type LogType, type PhotoHash, type RequirementSpec } from "../domain/milestone";

export const NOTES_MAX_LENGTH = 1000;

const numberSchema = (req: Extract<RequirementSpec, { type: "number" }>) => {
  let schema = z.number({ error: "Ingresa un número válido." });
  if (req.min !== undefined) schema = schema.min(req.min, { error: `Debe ser como mínimo ${req.min}.` });
  if (req.max !== undefined) schema = schema.max(req.max, { error: `Debe ser como máximo ${req.max}.` });
  return schema;
};

function fieldSchema(req: RequirementSpec) {
  switch (req.type) {
    case "number":
      return numberSchema(req);
    case "boolean_system_check":
      return z.boolean({ error: "Indica si la verificación se cumple." });
    case "photo_array":
      return z
        .array(z.url({ error: "Cada foto debe ser una URL válida." }), { error: "Adjunta las fotos requeridas." })
        .min(req.minItems, { error: `Adjunta al menos ${req.minItems} fotos.` });
  }
}

// Strict: every required key must be present and no unknown key is allowed.
export function buildEvidenceSchema(requirements: readonly RequirementSpec[]) {
  return z.strictObject(Object.fromEntries(requirements.map((r) => [r.fieldKey, fieldSchema(r)])));
}

export const evidenceLogInputSchema = z.object({
  logType: z.enum(LOG_TYPES, { error: "Selecciona un tipo de registro válido." }),
  notes: z
    .string({ error: "Las notas deben ser texto." })
    .max(NOTES_MAX_LENGTH, { error: `Máximo ${NOTES_MAX_LENGTH} caracteres.` }),
});

const INVALID_LOCATION = "La ubicación no es válida.";

// RF-19/RF-35, optional: same rules as the backend (latitude ±90, longitude ±180, 64 lowercase hex per photo of the log).
const locationSchema = z.object({
  latitude: z.number({ error: INVALID_LOCATION }).min(-90, { error: INVALID_LOCATION }).max(90, { error: INVALID_LOCATION }),
  longitude: z.number({ error: INVALID_LOCATION }).min(-180, { error: INVALID_LOCATION }).max(180, { error: INVALID_LOCATION }),
});
const photoHashSchema = z.object({
  url: z.string({ error: "La huella debe corresponder a una foto del registro." }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, { error: "La huella debe ser un SHA-256 en hexadecimal." }),
});

const photoUrls = (payload: unknown): Set<string> =>
  new Set(
    typeof payload === "object" && payload !== null
      ? Object.values(payload).flatMap((v) => (Array.isArray(v) ? v.filter((u): u is string => typeof u === "string") : []))
      : [],
  );

export function buildEvidenceLogSchema(requirements: readonly RequirementSpec[]) {
  return evidenceLogInputSchema
    .extend({
      evidencePayload: buildEvidenceSchema(requirements),
      location: locationSchema.optional(),
      photoHashes: z.array(photoHashSchema).optional(),
    })
    .superRefine((log, ctx) => {
      const photos = photoUrls(log.evidencePayload);
      log.photoHashes?.forEach((h, i) => {
        if (!photos.has(h.url)) {
          ctx.addIssue({ code: "custom", path: ["photoHashes", i, "url"], message: "La huella debe corresponder a una foto seleccionada del registro." });
        }
      });
    });
}

export type EvidenceLogInput = {
  logType: LogType;
  notes: string;
  evidencePayload: EvidencePayload;
  /** RF-19/RF-35, optional: where the evidence was taken. */
  location?: EvidenceLocation;
  /** RF-19/RF-35, optional: sha256 (hex) of each photo URL. */
  photoHashes?: PhotoHash[];
};

// The backend reports location and hash errors under `attestation.*`; the form shows them under `location` / `photoHashes`.
export function toEvidenceFieldErrors(server: FieldErrors): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, messages] of Object.entries(server)) (out[key.replace(/^attestation\./, "")] ??= []).push(...messages);
  return out;
}

/** Every message at `prefix` or below it (`prefix.0`, `prefix.0.url`…), in key order with the prefix itself first. */
export function errorsUnder(errors: FieldErrors, prefix: string): string[] | undefined {
  const keys = Object.keys(errors).filter((k) => k === prefix || k.startsWith(`${prefix}.`));
  if (keys.length === 0) return undefined;
  return keys.sort((a, b) => (a === prefix ? -1 : b === prefix ? 1 : a.localeCompare(b, "en", { numeric: true }))).flatMap((k) => errors[k]);
}

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    // An unrecognized-keys issue sits on the parent path; surface it under the offending key names.
    const keys =
      issue.code === "unrecognized_keys"
        ? issue.keys.map((k) => [...issue.path, k].join("."))
        : [issue.path.join(".") || FORM_LEVEL_KEY];
    for (const key of keys) (out[key] ??= []).push(issue.code === "unrecognized_keys" ? "Campo no permitido." : issue.message);
  }
  return out;
}

// FormData carries strings only; convert to the typed payload the schema expects.
// Blank numbers are omitted so the schema reports the field as missing.
export function parseEvidenceForm(form: FormData, requirements: readonly RequirementSpec[]): EvidencePayload {
  const payload: EvidencePayload = {};
  for (const req of requirements) {
    switch (req.type) {
      case "number": {
        const raw = String(form.get(req.fieldKey) ?? "").trim();
        if (raw !== "") payload[req.fieldKey] = Number(raw);
        break;
      }
      case "boolean_system_check":
        // A hidden "false" default plus a checkbox valued "true": any "true" wins, absence means not provided.
        if (form.has(req.fieldKey)) payload[req.fieldKey] = form.getAll(req.fieldKey).includes("true");
        break;
      case "photo_array":
        payload[req.fieldKey] = form.getAll(req.fieldKey).map(String).filter((u) => u !== "");
        break;
    }
  }
  return payload;
}

// RF-19/RF-35: hidden fields written by the evidence form. Blank coordinates mean «no location»; repeated photo URLs keep
// their first hash (the backend allows one per photo).
export function parseAttestationForm(form: FormData): Pick<EvidenceLogInput, "location" | "photoHashes"> {
  const latitude = String(form.get("latitude") ?? "").trim();
  const longitude = String(form.get("longitude") ?? "").trim();
  const urls = form.getAll("photoHashUrl").map(String);
  const hashes = form.getAll("photoHashSha256").map(String);
  const photoHashes: PhotoHash[] = [];
  urls.forEach((url, i) => {
    const sha256 = hashes[i] ?? "";
    if (url !== "" && sha256 !== "" && !photoHashes.some((h) => h.url === url)) photoHashes.push({ url, sha256 });
  });
  return {
    ...(latitude !== "" && longitude !== "" && { location: { latitude: Number(latitude), longitude: Number(longitude) } }),
    ...(photoHashes.length > 0 && { photoHashes }),
  };
}
