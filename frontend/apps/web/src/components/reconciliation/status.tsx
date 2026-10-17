import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { STATUS_HELP, STATUS_LABEL, type ReconciliationStatus } from "@agro/shared/modules/reconciliation/domain/reconciliation";
import { StatusBadge } from "@agro/shared/ui/status-badge";

// Status is always text + color + symbol.
const LOOK: Record<ReconciliationStatus, { tone: Tone; symbol: string }> = {
  CUADRA: { tone: "success", symbol: "✓" },
  DIFERENCIA: { tone: "danger", symbol: "≠" },
  FALTA_COMPROBANTE: { tone: "warning", symbol: "◷" },
  SIN_COMPROBANTE: { tone: "danger", symbol: "✕" },
  UNKNOWN: { tone: "neutral", symbol: "○" },
};

export function ReconciliationStatusBadge({ status }: { status: ReconciliationStatus }) {
  return <StatusBadge label={STATUS_LABEL[status].toUpperCase()} {...LOOK[status]} />;
}

export const statusHelp = (status: ReconciliationStatus): string => STATUS_HELP[status];
