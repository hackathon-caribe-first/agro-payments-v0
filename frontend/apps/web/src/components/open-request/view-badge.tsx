import type { OpenRequestView } from "@agro/shared/modules/presales/domain/presale";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { StatusBadge } from "@agro/shared/ui/status-badge";

type Label = { label: string; tone: Tone; symbol: string };

// The view is derived (never stored), see openRequestView.
const VIEW_LABELS: Record<OpenRequestView, Label> = {
  OPEN: { label: "Abierta", tone: "success", symbol: "✓" },
  PARTIALLY_AWARDED: { label: "Parcialmente acordada", tone: "warning", symbol: "◐" },
  FULFILLED: { label: "Completada", tone: "success", symbol: "✓" },
  EXPIRED: { label: "Vencida", tone: "neutral", symbol: "○" },
  CLOSED: { label: "Cerrada", tone: "neutral", symbol: "○" },
  UNKNOWN: { label: "Estado desconocido", tone: "neutral", symbol: "○" },
};

export const OpenRequestViewBadge = ({ view }: { view: OpenRequestView }) => <StatusBadge {...VIEW_LABELS[view]} />;
