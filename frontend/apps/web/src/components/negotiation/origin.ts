import type { Origin } from "@agro/shared/modules/presales/domain/presale";

// Where a negotiation started, as shown to users.
const ORIGIN_LABELS: Record<Origin, string> = {
  PROJECT_INTEREST: "Interés en un proyecto",
  OPEN_REQUEST: "Solicitud abierta",
  UNKNOWN: "Origen desconocido",
};

export const originLabel = (origin: Origin): string => ORIGIN_LABELS[origin];
