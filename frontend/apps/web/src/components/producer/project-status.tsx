import type { ProjectStatus } from "@agro/shared/modules/projects/domain/project";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { StatusBadge } from "@agro/shared/ui/status-badge";

type ProjectStatusLabel = { label: string; tone: Tone; symbol: string };

const PROJECT_STATUS_LABELS: Record<ProjectStatus, ProjectStatusLabel> = {
  DRAFT: { label: "Borrador", tone: "neutral", symbol: "○" },
  CONTRACT_SIGNED: { label: "Contrato firmado", tone: "neutral", symbol: "✓" },
  // PRD v3: a published project raises capital, then it is funded in custody.
  FUNDING_IN_PROGRESS: { label: "En captación", tone: "warning", symbol: "◷" },
  FUNDED_IN_CUSTODY: { label: "Fondeado en custodia", tone: "success", symbol: "✓" },
  IN_EXECUTION: { label: "En ejecución", tone: "warning", symbol: "◷" },
  HARVEST_DECLARED: { label: "Cosecha declarada", tone: "warning", symbol: "◷" },
  HARVEST_CERTIFIED: { label: "Cosecha certificada", tone: "success", symbol: "✓" },
  LISTED_IN_MARKET: { label: "Publicado en el mercado", tone: "neutral", symbol: "○" },
  MARKET_PAYMENT_HELD: { label: "Pago retenido", tone: "warning", symbol: "◷" },
  DELIVERED_TO_BUYER: { label: "Entregado al comprador", tone: "success", symbol: "✓" },
  SETTLEMENT_PROCESSING: { label: "Liquidación en proceso", tone: "warning", symbol: "◷" },
  SETTLED_AND_CLOSED: { label: "Liquidado y cerrado", tone: "success", symbol: "✓" },
  CANCELLED_OR_DISPUTED: { label: "Cancelado o en disputa", tone: "danger", symbol: "✕" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <StatusBadge {...PROJECT_STATUS_LABELS[status]} />;
}
