import type { ListingStatus } from "@agro/shared/modules/presales/domain/presale";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import { NegotiationStatusBadge } from "~/components/negotiation/status-badge";

type Label = { label: string; tone: Tone; symbol: string };

const LISTING_LABELS: Record<ListingStatus, Label> = {
  OPEN: { label: "Abierta", tone: "success", symbol: "✓" },
  CLOSED: { label: "Cerrada", tone: "neutral", symbol: "○" },
  UNKNOWN: { label: "Estado desconocido", tone: "neutral", symbol: "○" },
};

// The negotiation badge lives with the negotiation components; this name stays for existing callers.
export const RequestStatusBadge = NegotiationStatusBadge;

export const ListingStatusBadge = ({ status }: { status: ListingStatus }) => <StatusBadge {...LISTING_LABELS[status]} />;
