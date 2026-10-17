import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import type { GrantConflictCode, GrantError } from "@agro/shared/modules/grants/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";

export type GrantActionData = { fieldErrors: FieldErrors; done?: string };

const CONFLICT_MESSAGES: Record<GrantConflictCode, string> = {
  LIVE_GRANT_EXISTS: "Este hito ya tiene un grant vigente.",
  PREVIOUS_GRANT_NOT_REVOKED: "Primero debe revocarse el grant del hito anterior.",
  MILESTONE_CLOSED: "El grant de este hito ya se cerró: no admite uno nuevo.",
  NOT_PENDING_APPROVAL: "Este grant ya no está pendiente de aprobación.",
  NOT_ACTIVE: "El grant todavía no está activo.",
  GRANT_LIMIT_EXCEEDED: "El pago no cabe en lo que queda del tope del grant.",
  GRANT_REVOKED: "El grant fue revocado: no admite más pagos.",
  // PoC lesson: the wallet shows "Access to the given resource is forbidden" when the browser holds another account.
  WALLET_ACCOUNT_MISMATCH:
    "La billetera no te dio acceso. Entra con la cuenta dueña de la billetera del inversor, cierra la sesión de otras cuentas e intenta de nuevo.",
  HASH_MISMATCH: "No pudimos verificar la aprobación de la billetera. Vuelve a aprobar el grant.",
  UNKNOWN: "No pudimos completar la acción sobre el grant.",
};

export function grantErrorMessage(error: GrantError, currency = "COP"): string {
  switch (error.kind) {
    case "not_found":
      return "No encontramos este grant.";
    case "validation":
      return "Revisa los campos marcados e intenta de nuevo.";
    case "boundary":
      return "Recibimos datos con un formato inesperado. Intenta de nuevo en unos minutos.";
    case "network":
      return "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
    case "conflict":
      return error.code === "GRANT_LIMIT_EXCEEDED" && error.remaining !== null
        ? `${CONFLICT_MESSAGES.GRANT_LIMIT_EXCEEDED} Quedan ${formatMoney(error.remaining, currency)}.`
        : CONFLICT_MESSAGES[error.code];
  }
}

export function toGrantActionData(error: GrantError, currency = "COP"): GrantActionData {
  if (error.kind === "validation") return { fieldErrors: error.fieldErrors };
  return { fieldErrors: { [FORM_LEVEL_KEY]: [grantErrorMessage(error, currency)] } };
}
