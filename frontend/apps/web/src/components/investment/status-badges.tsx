import type { ContractStatus, ProposalStatus, RevisionStatus } from "@agro/shared/modules/investment-proposals/domain/investment";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { StatusBadge } from "@agro/shared/ui/status-badge";

type Label = { label: string; tone: Tone; symbol: string };

const UNKNOWN: Label = { label: "Estado desconocido", tone: "neutral", symbol: "○" };

const PROPOSAL_LABELS: Record<ProposalStatus, Label> = {
  PROPOSED: { label: "Propuesta enviada", tone: "warning", symbol: "◷" },
  NEGOTIATING: { label: "En negociación", tone: "warning", symbol: "⇄" },
  ACCEPTED: { label: "Acordada", tone: "success", symbol: "✓" },
  REJECTED: { label: "Rechazada", tone: "danger", symbol: "✕" },
  WITHDRAWN: { label: "Retirada", tone: "neutral", symbol: "○" },
  EXPIRED: { label: "Vencida", tone: "neutral", symbol: "○" },
  UNKNOWN,
};

const REVISION_LABELS: Record<RevisionStatus, Label> = {
  SENT: { label: "Vigente", tone: "warning", symbol: "◷" },
  ACCEPTED: { label: "Aceptada", tone: "success", symbol: "✓" },
  REJECTED: { label: "Rechazada", tone: "danger", symbol: "✕" },
  EXPIRED: { label: "Vencida", tone: "neutral", symbol: "○" },
  SUPERSEDED: { label: "Superada", tone: "neutral", symbol: "↺" },
  WITHDRAWN: { label: "Retirada", tone: "neutral", symbol: "○" },
  UNKNOWN,
};

const CONTRACT_LABELS: Record<ContractStatus, Label> = {
  PENDING_SIGNATURES: { label: "Pendiente de firmas", tone: "warning", symbol: "◷" },
  SIGNED: { label: "Firmado", tone: "success", symbol: "✓" },
  UNKNOWN,
};

// History stores raw status strings: known ones get their es-CO label, others are shown as received.
export const proposalStatusText = (raw: string): string => (PROPOSAL_LABELS as Record<string, Label>)[raw]?.label ?? raw;

export const ProposalStatusBadge = ({ status }: { status: ProposalStatus }) => <StatusBadge {...PROPOSAL_LABELS[status]} />;
export const RevisionStatusBadge = ({ status }: { status: RevisionStatus }) => <StatusBadge {...REVISION_LABELS[status]} />;
export const ContractStatusBadge = ({ status }: { status: ContractStatus }) => <StatusBadge {...CONTRACT_LABELS[status]} />;
