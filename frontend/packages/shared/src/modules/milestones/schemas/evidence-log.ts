import { z } from "zod";
import { FORM_LEVEL_KEY, type FieldErrors } from "../domain/errors";
import { LOG_TYPES, type EvidencePayload, type LogType, type RequirementSpec } from "../domain/milestone";

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

export function buildEvidenceLogSchema(requirements: readonly RequirementSpec[]) {
  return evidenceLogInputSchema.extend({ evidencePayload: buildEvidenceSchema(requirements) });
}

export type EvidenceLogInput = {
  logType: LogType;
  notes: string;
  evidencePayload: EvidencePayload;
};

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
