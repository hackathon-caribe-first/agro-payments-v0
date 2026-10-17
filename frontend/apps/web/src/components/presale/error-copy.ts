import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import type { PresaleError } from "@agro/shared/modules/presales/domain/errors";

export type PresaleActionData = { fieldErrors: FieldErrors };

const BACKING_MESSAGES = {
  closed: "El proyecto elegido no tiene una preventa abierta.",
  unit: "La unidad del proyecto no coincide con la de la solicitud.",
  not_owned: "El proyecto elegido no pertenece a este productor.",
  sold_out: "El proyecto elegido no tiene disponibilidad.",
} as const;

function transitionMessage(from: string, action: string): string {
  switch (action) {
    case "publish":
      return from === "OPEN"
        ? "Este proyecto ya tiene una preventa abierta."
        : "No se puede publicar una preventa para un proyecto en este estado.";
    case "close":
      return "La preventa ya no está abierta.";
    case "request":
      return from === "SOLD_OUT" ? "Esta preventa ya no tiene disponibilidad." : "Esta preventa no admite nuevas solicitudes.";
    case "respond":
      return from === "OPEN" || from === "CLOSED"
        ? "La preventa está cerrada: no se pueden enviar nuevas ofertas."
        : "Esta solicitud ya no admite una oferta.";
    case "accept":
    case "reject":
      return from === "EXPIRED" ? "La oferta venció." : "Esta oferta ya no se puede decidir.";
    case "counter":
      return from === "EXPIRED" ? "La oferta venció: inicia una nueva negociación." : "Esta negociación ya no admite contraofertas.";
    case "withdraw":
      return from === "EXPIRED" ? "La oferta venció: ya no hay nada que retirar." : "Esta negociación ya terminó.";
    case "close_open_request":
      return "La solicitud abierta ya está cerrada.";
    case "start_on_open_request":
      return from === "CLOSED"
        ? "Esta solicitud abierta está cerrada: no admite nuevas negociaciones."
        : "Esta solicitud abierta ya no admite nuevas negociaciones.";
    default:
      return "Esta acción ya no está disponible para la solicitud.";
  }
}

// Business conflicts (409) and unexpected failures become one form-level message.
export function presaleErrorMessage(error: PresaleError): string {
  switch (error.kind) {
    case "not_found":
      return "No encontramos este registro.";
    case "validation":
      return "Revisa los campos marcados e intenta de nuevo.";
    case "boundary":
      return "Recibimos datos con un formato inesperado. Intenta de nuevo en unos minutos.";
    case "network":
      return "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
    case "oversold":
      return error.available > 0 ? `Supera la cantidad disponible (${error.available}).` : "Esta preventa ya no tiene disponibilidad.";
    case "invalid_transition":
      return transitionMessage(error.from, error.action);
    case "not_your_turn":
      return "Es el turno de la otra parte.";
    case "over_allocated":
      return `Supera la cantidad pendiente por asignar (${error.remaining}).`;
    case "duplicate_negotiation":
      return "Ya tienes una negociación activa en esta solicitud.";
    case "backing_mismatch":
      return BACKING_MESSAGES[error.reason];
  }
}

export function toActionData(error: PresaleError): PresaleActionData {
  if (error.kind === "validation") return { fieldErrors: error.fieldErrors };
  return { fieldErrors: { [FORM_LEVEL_KEY]: [presaleErrorMessage(error)] } };
}
