import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import type { PresaleError } from "@agro/shared/modules/presales/domain/errors";

export type PresaleActionData = { fieldErrors: FieldErrors };

const BACKING_MESSAGES = {
  closed: "El proyecto elegido ya no admite ofertas.",
  not_owned: "El proyecto elegido no pertenece a este productor.",
} as const;

const NOT_NEGOTIABLE_MESSAGES = {
  own_project: "No puedes negociar sobre un proyecto propio.",
  project_status: "Este proyecto ya no admite nuevas negociaciones.",
  project_agreed: "Este proyecto ya tiene un acuerdo: no admite nuevas negociaciones.",
  milestone_status: "Este hito ya no admite nuevas negociaciones.",
  milestone_agreed: "Este hito ya tiene un acuerdo: no admite nuevas negociaciones.",
  duplicate: "Ya tienes una negociación activa para este proyecto o hito.",
} as const;

const DEPOSIT_MESSAGES = {
  not_project: "Solo los acuerdos del proyecto tienen depósito.",
  not_agreed: "Esta negociación no tiene un depósito pendiente.",
  already_deposited: "El depósito ya se realizó.",
  not_owner: "Solo el comprador de este acuerdo puede depositar.",
  project_status: "Este proyecto ya no admite depósitos.",
  no_total: "El proyecto no tiene hitos: no hay un total para depositar.",
} as const;

function transitionMessage(from: string, action: string): string {
  switch (action) {
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
    case "not_negotiable":
      return NOT_NEGOTIABLE_MESSAGES[error.reason];
    case "deposit_unavailable":
      return DEPOSIT_MESSAGES[error.reason];
    case "total_changed":
      return "El total de la cotización del proyecto cambió. Revisa el nuevo monto antes de depositar.";
  }
}

export function toActionData(error: PresaleError): PresaleActionData {
  if (error.kind === "validation") return { fieldErrors: error.fieldErrors };
  return { fieldErrors: { [FORM_LEVEL_KEY]: [presaleErrorMessage(error)] } };
}
