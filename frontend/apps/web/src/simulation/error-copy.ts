import type { SimulationError } from "@agro/shared/modules/simulation/application/use-cases";
import type { FieldErrors } from "@agro/shared/modules/milestones/domain/errors";

export type SimulationActionData = { ok: true; intent: string } | { ok: false; intent: string; message: string; fieldErrors?: FieldErrors };

// Typed errors → es-CO copy. A 409 carries the server's own sentence (reasons and minimum price), shown as is.
export function simulationErrorMessage(error: SimulationError): string {
  switch (error.kind) {
    case "rejected":
      return error.message;
    case "validation":
      return "Revisa los campos marcados e intenta de nuevo.";
    case "boundary":
      return "Recibimos la ficha con un formato inesperado. Intenta de nuevo en unos minutos.";
    case "network":
      return "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
  }
}

export const toSimulationActionData = (intent: string, error: SimulationError): SimulationActionData => ({
  ok: false,
  intent,
  message: simulationErrorMessage(error),
  fieldErrors: error.kind === "validation" ? error.fieldErrors : undefined,
});
