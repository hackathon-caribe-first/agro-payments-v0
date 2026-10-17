import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import type { InvestmentError } from "@agro/shared/modules/investment-proposals/domain/errors";

export type InvestmentActionData = { fieldErrors: FieldErrors };

const PROPOSE_MESSAGES = {
  project_status: "Este proyecto ya no admite propuestas de inversión.",
  contract_exists: "Este proyecto ya tiene un contrato: no admite nuevas propuestas.",
  duplicate: "Ya tienes una propuesta activa para este proyecto.",
} as const;

const SIGN_MESSAGES = {
  not_pending: "Este contrato ya no está pendiente de firmas.",
  already_signed: "Ya firmaste este contrato.",
  not_party: "Solo las partes del contrato pueden firmarlo.",
} as const;

function transitionMessage(from: string, action: string): string {
  switch (action) {
    case "accept":
    case "reject":
      return from === "EXPIRED" ? "La propuesta venció." : "Esta oferta ya no se puede decidir.";
    case "counter":
      return from === "EXPIRED" ? "La propuesta venció: inicia una nueva." : "Esta propuesta ya no admite contraofertas.";
    case "withdraw":
      return from === "EXPIRED" ? "La propuesta venció: ya no hay nada que retirar." : "Esta propuesta ya terminó.";
    default:
      return "Esta acción ya no está disponible para la propuesta.";
  }
}

// Business conflicts (409) and unexpected failures become one form-level message.
export function investmentErrorMessage(error: InvestmentError): string {
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
    case "not_proposable":
      return PROPOSE_MESSAGES[error.reason];
    case "not_signable":
      return SIGN_MESSAGES[error.reason];
  }
}

export const proposeBlockText = (reason: keyof typeof PROPOSE_MESSAGES): string => PROPOSE_MESSAGES[reason];

export function toActionData(error: InvestmentError): InvestmentActionData {
  if (error.kind === "validation") return { fieldErrors: error.fieldErrors };
  return { fieldErrors: { [FORM_LEVEL_KEY]: [investmentErrorMessage(error)] } };
}
