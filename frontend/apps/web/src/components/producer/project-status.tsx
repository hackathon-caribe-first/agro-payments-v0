import type { ProjectStatus } from "@agro/shared/modules/projects/domain/project";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { StatusBadge } from "@agro/shared/ui/status-badge";

type ProjectStatusLabel = { label: string; tone: Tone; symbol: string };

const PROJECT_STATUS_LABELS: Record<ProjectStatus, ProjectStatusLabel> = {
  DRAFT: { label: "Borrador", tone: "neutral", symbol: "○" },
  CONTRACT_SIGNED: { label: "Contrato firmado", tone: "neutral", symbol: "✓" },
  FUNDING_IN_PROGRESS: { label: "En espera de aprobación", tone: "warning", symbol: "◷" },
  FUNDED_IN_CUSTODY: { label: "Habilitado", tone: "success", symbol: "✓" },
  IN_EXECUTION: { label: "En ejecución", tone: "warning", symbol: "◷" },
  HARVEST_DECLARED: { label: "Cosecha declarada", tone: "warning", symbol: "◷" },
  HARVEST_CERTIFIED: { label: "Cosecha certificada", tone: "success", symbol: "✓" },
  LISTED_IN_MARKET: { label: "Publicado en el mercado", tone: "neutral", symbol: "○" },
  MARKET_PAYMENT_HELD: { label: "Pago autorizado, esperando entrega", tone: "warning", symbol: "◷" },
  DELIVERED_TO_BUYER: { label: "Entregado al comprador", tone: "success", symbol: "✓" },
  SETTLEMENT_PROCESSING: { label: "Liquidación en proceso", tone: "warning", symbol: "◷" },
  SETTLED_AND_CLOSED: { label: "Liquidado y cerrado", tone: "success", symbol: "✓" },
  CANCELLED_OR_DISPUTED: { label: "Cancelado o en disputa", tone: "danger", symbol: "✕" },
};

// Buyers see projects from creation, so "Borrador" would be misleading for them.
const BUYER_STATUS_OVERRIDES: Partial<Record<ProjectStatus, ProjectStatusLabel>> = {
  DRAFT: { label: "Disponible para negociar", tone: "neutral", symbol: "○" },
  // The producer sees the project "habilitado"; for the buyer the same status means a payment was authorized.
  FUNDED_IN_CUSTODY: { label: "Pago autorizado", tone: "success", symbol: "✓" },
};

export function ProjectStatusBadge({ status, audience = "producer" }: { status: ProjectStatus; audience?: "producer" | "buyer" }) {
  const label = (audience === "buyer" ? BUYER_STATUS_OVERRIDES[status] : undefined) ?? PROJECT_STATUS_LABELS[status];
  return <StatusBadge {...label} />;
}
