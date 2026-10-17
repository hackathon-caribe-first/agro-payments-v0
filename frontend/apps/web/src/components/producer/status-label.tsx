import type { MilestoneStatus } from "@agro/shared/modules/milestones/domain/milestone";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { StatusBadge } from "@agro/shared/ui/status-badge";

type StatusLabel = { label: string; tone: Tone; symbol: string };

const STATUS_LABELS: Record<MilestoneStatus, StatusLabel> = {
  LOCKED: { label: "Bloqueado", tone: "neutral", symbol: "🔒" },
  ACTIVE: { label: "Activo", tone: "neutral", symbol: "○" },
  SUPPLIES_ORDERED: { label: "Insumos solicitados", tone: "warning", symbol: "◷" },
  SUPPLIES_PAID: { label: "Insumos pagados", tone: "success", symbol: "✓" },
  IN_FIELD_EXECUTION: { label: "En ejecución en campo", tone: "warning", symbol: "◷" },
  SUBMITTED_FOR_REVIEW: { label: "En revisión técnica", tone: "warning", symbol: "◷" },
  CHANGES_REQUESTED: { label: "Requiere correcciones", tone: "danger", symbol: "✕" },
  TECHNICALLY_APPROVED: { label: "Aprobado técnicamente", tone: "success", symbol: "✓" },
  LABOR_PAYOUT_PENDING: { label: "Pago de mano de obra pendiente", tone: "warning", symbol: "◷" },
  COMPLETED_AND_PAID: { label: "Completado y pagado", tone: "success", symbol: "✓" },
};

export const statusLabel = (status: MilestoneStatus): StatusLabel => STATUS_LABELS[status];

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  return <StatusBadge {...statusLabel(status)} />;
}
