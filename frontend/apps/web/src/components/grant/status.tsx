import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { GrantActor, GrantEvent, GrantStatus, HashState, RevocationReason } from "@agro/shared/modules/grants/domain/grant";
import { failureText } from "@agro/shared/modules/payment-lines/domain/line";
import { StatusBadge } from "@agro/shared/ui/status-badge";

type Label = { label: string; tone: Tone; symbol: string };

const UNKNOWN: Label = { label: "Estado desconocido", tone: "neutral", symbol: "○" };

// Status is always text + color + symbol.
const GRANT_LABELS: Record<GrantStatus, Label> = {
  PENDING_APPROVAL: { label: "Pendiente de aprobación", tone: "warning", symbol: "◷" },
  ACTIVE: { label: "Activo", tone: "success", symbol: "✓" },
  REVOKED: { label: "Revocado", tone: "neutral", symbol: "⊘" },
  DENIED: { label: "Rechazado", tone: "danger", symbol: "✕" },
  EXPIRED: { label: "Vencido", tone: "neutral", symbol: "○" },
  UNKNOWN,
};

export const grantStatusText = (status: GrantStatus): string => GRANT_LABELS[status].label;
export const GrantStatusBadge = ({ status }: { status: GrantStatus }) => <StatusBadge {...GRANT_LABELS[status]} />;

const REASON_LABELS: Record<RevocationReason, string> = {
  LAST_LINE_CONFIRMED: "Última línea de pago confirmada",
  MILESTONE_CANCELLED: "Hito cancelado",
  DEADLINE_EXPIRED: "Plazo del hito vencido",
  SECURITY_INCIDENT: "Incidente de seguridad",
  UNKNOWN: "Motivo desconocido",
};

export const revocationReasonText = (reason: RevocationReason): string => REASON_LABELS[reason];

const HASH_LABELS: Record<HashState, Label> = {
  PENDING: { label: "Sin aprobación recibida", tone: "neutral", symbol: "○" },
  VERIFIED: { label: "Aprobación verificada", tone: "success", symbol: "✓" },
  MISMATCH: { label: "Aprobación no verificada", tone: "danger", symbol: "✕" },
  UNKNOWN,
};

export const HashStateBadge = ({ state }: { state: HashState }) => <StatusBadge {...HASH_LABELS[state]} />;

export const ACTOR_LABELS: Record<GrantActor, string> = {
  INVESTOR: "Inversor",
  PLATFORM: "Plataforma",
  WALLET: "Billetera",
  UNKNOWN: "Otro",
};

const num = (value: unknown): number => (typeof value === "number" ? value : 0);
const str = (value: unknown): string => (typeof value === "string" ? value : "");

// "Línea: Fertilizante" when the event carries the concept; the internal line id is never shown.
const lineLabel = (d: Record<string, unknown>): string => (str(d.concept) ? ` (línea: ${str(d.concept)})` : "");

// Raw machine code of an event, for tooltips and the trace area only.
export const eventCode = (event: GrantEvent): string | undefined => str(event.detail.code) || undefined;

// One es-CO sentence per audit event.
export function eventText(event: GrantEvent, currency: string): string {
  const d = event.detail;
  switch (event.type) {
    case "REQUESTED":
      return `Grant solicitado con tope de ${formatMoney(num(d.cap), currency)}, sin intervalo.`;
    case "APPROVAL_RECEIVED":
      return "La billetera devolvió la aprobación del inversor.";
    case "HASH_VERIFIED":
      return "Hash de interacción verificado.";
    case "HASH_MISMATCH":
      return "El hash de interacción no coincide: el grant sigue sin activarse.";
    case "TOKEN_STORED":
      return "Token y enlaces de gestión guardados cifrados.";
    case "DENIED":
      return "El inversor rechazó el grant en su billetera.";
    case "TOKEN_ROTATED":
      return d.retried ? "El token venció: se rotó y el pago se reintentó una sola vez." : "Token rotado con el enlace de gestión.";
    case "PAYMENT_CONFIRMED":
      return `Pago confirmado${str(d.concept) ? `: ${str(d.concept)}` : ""}. Gastado: ${formatMoney(num(d.spent_after), currency)}.`;
    case "PAYMENT_REJECTED":
      return `Pago rechazado${lineLabel(d)}. ${failureText("GRANT_LIMIT_EXCEEDED", formatMoney(num(d.remaining), currency))}`;
    case "PAYMENT_FAILED":
      return `${failureText(str(d.code) || "NETWORK_ERROR") ?? "La billetera no respondió."}${lineLabel(d)}. No se pagó nada y el pago se reintenta de forma segura, sin duplicarse.`;
    case "REVOKED":
      return `Grant revocado: ${revocationReasonText((str(d.reason) || "UNKNOWN") as RevocationReason)}. La billetera respondió ${num(d.delete_status)} y se borraron los tokens guardados.`;
    case "REVOCATION_VERIFIED":
      return "Comprobado: un pago posterior fue rechazado, el token ya no sirve.";
    case "UNKNOWN":
      return "Evento registrado.";
  }
}
