import type { FieldErrors, MilestoneError } from "@agro/shared/modules/milestones/domain/errors";

export type ProducerActionResult = { ok: true } | { ok: false; message: string; fieldErrors?: FieldErrors };

// Maps typed domain errors to user-facing es-CO copy.
export function errorMessage(error: MilestoneError): string {
  switch (error.kind) {
    case "not_found":
      return "No encontramos este hito.";
    case "invalid_transition":
      return "Esta acción ya no está disponible para el estado actual del hito. Recarga para ver su estado.";
    case "incomplete_requirements":
      return "Faltan requisitos por completar antes de enviar el hito a revisión.";
    case "validation":
      return "Revisa los campos marcados e intenta de nuevo.";
    case "boundary":
      return "Recibimos datos con un formato inesperado. Intenta de nuevo en unos minutos.";
    case "network":
      return "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
  }
}

export function toActionResult(error: MilestoneError): ProducerActionResult {
  return {
    ok: false,
    message: errorMessage(error),
    fieldErrors: error.kind === "validation" ? error.fieldErrors : undefined,
  };
}
