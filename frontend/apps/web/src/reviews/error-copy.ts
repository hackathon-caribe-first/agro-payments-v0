import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import type { ReviewError } from "@agro/shared/modules/reviews/domain/errors";

export type ReviewActionData = { ok: true; message: string } | { ok: false; fieldErrors: FieldErrors };

// Typed domain errors become es-CO copy.
export function reviewErrorMessage(error: ReviewError): string {
  switch (error.kind) {
    case "not_found":
      return "No encontramos este hito.";
    case "not_assigned":
      return "Solo el verificador asignado al proyecto puede emitir el dictamen.";
    case "invalid_transition":
      return "Este hito ya no está en revisión técnica. Recarga para ver su estado actual.";
    case "payout_blocked":
      return "No se puede pagar: falta un dictamen aprobado y firmado por el verificador asignado.";
    case "validation":
      return "Revisa los campos marcados e intenta de nuevo.";
    case "boundary":
      return "Recibimos datos con un formato inesperado. Intenta de nuevo en unos minutos.";
    case "network":
      return "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
  }
}

export function toActionData(error: ReviewError): ReviewActionData {
  if (error.kind === "validation") return { ok: false, fieldErrors: error.fieldErrors };
  return { ok: false, fieldErrors: { [FORM_LEVEL_KEY]: [reviewErrorMessage(error)] } };
}
