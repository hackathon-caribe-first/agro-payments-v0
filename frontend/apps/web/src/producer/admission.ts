import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import type { AdmissionResponse } from "@agro/shared/modules/simulation/domain/admission";
import { parseAdmissionForm, toAdmissionFieldErrors } from "@agro/shared/modules/simulation/schemas/admission-form";
import { jsonRequest } from "~/platform/json-request";

/** RF-02/RF-03: the project's latest admission (nine filters with evidence, A15 score → level). */
export type Admission = AdmissionResponse;

export const ADMISSION_INTENT = "admission";

export const LEVEL_LABEL: Record<Admission["level"], string> = { A: "Nivel A", B: "Nivel B", C: "Nivel C", primer_ciclo: "Primer ciclo" };

export const financeableLabel = (pct: Admission["financeable_pct"]) => {
  if (!pct) return "Monto pequeño, en grupo";
  return pct.min === null ? `Hasta ${pct.max} %` : `${pct.min}–${pct.max} %`;
};

export type AdmissionActionData = { ok: true; admission: Admission } | { ok: false; fieldErrors: FieldErrors };

const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/admission`;

/** null when the project has not been assessed yet (404) or the server is not reachable. */
export async function loadAdmission(projectId: string): Promise<Admission | null> {
  const result = await jsonRequest<Admission>(path(projectId));
  return result.ok ? result.value : null;
}

// Checks the form like the backend does (so mock mode answers the same), then POSTs; a 400 lands under each field.
export async function admissionAction(projectId: string, form: FormData): Promise<AdmissionActionData> {
  const parsed = parseAdmissionForm(form);
  if (!parsed.ok) return parsed;
  const result = await jsonRequest<Admission>(path(projectId), { method: "POST", body: parsed.request });
  if (result.ok) return { ok: true, admission: result.value };
  const fieldErrors = result.status === 400 && result.fieldErrors ? toAdmissionFieldErrors(result.fieldErrors) : {};
  return { ok: false, fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : { [FORM_LEVEL_KEY]: [result.message] } };
}
