import type { QuoteStatus, RequestStatus } from "@agro/shared/modules/presales/domain/presale";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { StatusBadge } from "@agro/shared/ui/status-badge";

type Label = { label: string; tone: Tone; symbol: string };

const UNKNOWN: Label = { label: "Estado desconocido", tone: "neutral", symbol: "○" };

// Wire statuses keep their names; ACCEPTED reads "Acordada" and CANCELLED reads "Retirada".
const NEGOTIATION_LABELS: Record<RequestStatus, Label> = {
  REQUESTED: { label: "Solicitada", tone: "warning", symbol: "◷" },
  QUOTED: { label: "Oferta recibida", tone: "warning", symbol: "◷" },
  NEGOTIATING: { label: "En negociación", tone: "warning", symbol: "⇄" },
  ACCEPTED: { label: "Acordada", tone: "success", symbol: "✓" },
  REJECTED: { label: "Rechazada", tone: "danger", symbol: "✕" },
  CANCELLED: { label: "Retirada", tone: "neutral", symbol: "○" },
  EXPIRED: { label: "Vencida", tone: "neutral", symbol: "○" },
  UNKNOWN,
};

const OFFER_LABELS: Record<QuoteStatus, Label> = {
  SENT: { label: "Vigente", tone: "warning", symbol: "◷" },
  ACCEPTED: { label: "Aceptada", tone: "success", symbol: "✓" },
  REJECTED: { label: "Rechazada", tone: "danger", symbol: "✕" },
  EXPIRED: { label: "Vencida", tone: "neutral", symbol: "○" },
  SUPERSEDED: { label: "Superada", tone: "neutral", symbol: "↺" },
  WITHDRAWN: { label: "Retirada", tone: "neutral", symbol: "○" },
  UNKNOWN,
};

// History stores raw status strings: known ones get their es-CO label, others are shown as received.
export const negotiationStatusText = (raw: string): string => (NEGOTIATION_LABELS as Record<string, Label>)[raw]?.label ?? raw;

export const NegotiationStatusBadge = ({ status }: { status: RequestStatus }) => <StatusBadge {...NEGOTIATION_LABELS[status]} />;
export const OfferStatusBadge = ({ status }: { status: QuoteStatus }) => <StatusBadge {...OFFER_LABELS[status]} />;
