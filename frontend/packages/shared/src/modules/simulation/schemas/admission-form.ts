import { FORM_LEVEL_KEY, type FieldErrors } from "../../milestones/domain/errors";
import { ADMISSION_BLOCKS, ELIMINATION_FILTERS, EVIDENCE_MAX_LENGTH, type AdmissionBlock, type AdmissionRequest, type FilterAnswer } from "../domain/admission";

// Form controls are named after the backend's error paths (filters.<i>.passes, filters.<i>.evidence, blocks.<key>), so a
// 400 lands under the same field the client check would have used. Messages mirror validateAdmissionRequest.
export const filterField = (index: number, part: keyof FilterAnswer) => `filters.${index}.${part}`;
export const blockField = (block: AdmissionBlock) => `blocks.${block}`;

export type AdmissionFormResult = { ok: true; request: AdmissionRequest } | { ok: false; fieldErrors: FieldErrors };

const add = (errors: FieldErrors, key: string, message: string) => {
  (errors[key] ??= []).push(message);
};

export function parseAdmissionForm(form: FormData): AdmissionFormResult {
  const errors: FieldErrors = {};
  const filters = ELIMINATION_FILTERS.map((_, i): FilterAnswer => {
    const passes = String(form.get(filterField(i, "passes")) ?? "");
    const evidence = String(form.get(filterField(i, "evidence")) ?? "").trim();
    if (passes !== "true" && passes !== "false") add(errors, filterField(i, "passes"), "Indica si el filtro se cumple.");
    if (evidence === "") add(errors, filterField(i, "evidence"), "Agrega la evidencia del filtro.");
    else if (evidence.length > EVIDENCE_MAX_LENGTH) add(errors, filterField(i, "evidence"), `Máximo ${EVIDENCE_MAX_LENGTH} caracteres.`);
    return { passes: passes === "true", evidence };
  });
  const blocks = {} as Record<AdmissionBlock, number>;
  for (const { key } of ADMISSION_BLOCKS) {
    const raw = String(form.get(blockField(key)) ?? "").trim().replace(",", ".");
    const value = raw === "" ? Number.NaN : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) add(errors, blockField(key), "Ingresa un puntaje entre 0 y 100.");
    blocks[key] = value;
  }
  return Object.keys(errors).length > 0 ? { ok: false, fieldErrors: errors } : { ok: true, request: { filters, blocks } };
}

const FIELD_KEY = /^(filters\.\d+\.(passes|evidence)|blocks\.[a-z_]+)$/;

/** Server 400 → form errors: field paths stay put; the list-level `filters` key and anything unknown go to the form level. */
export function toAdmissionFieldErrors(server: FieldErrors): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, messages] of Object.entries(server)) (out[FIELD_KEY.test(key) ? key : FORM_LEVEL_KEY] ??= []).push(...messages);
  return out;
}
