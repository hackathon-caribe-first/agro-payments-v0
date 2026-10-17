// Domain types for producer projects. Enum values mirror the PRD exactly.

export const PROJECT_STATUSES = [
  "DRAFT",
  "CONTRACT_SIGNED",
  "FUNDING_IN_PROGRESS",
  "FUNDED_IN_CUSTODY",
  "IN_EXECUTION",
  "HARVEST_DECLARED",
  "HARVEST_CERTIFIED",
  "LISTED_IN_MARKET",
  "MARKET_PAYMENT_HELD",
  "DELIVERED_TO_BUYER",
  "SETTLEMENT_PROCESSING",
  "SETTLED_AND_CLOSED",
  "CANCELLED_OR_DISPUTED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id: string;
  projectCode: string;
  title: string;
  productionType: string;
  description: string;
  targetAmount: number;
  custodyBalance: number;
  totalDisbursed: number;
  investorRoiPct: number;
  platformFeePct: number;
  currentStatus: ProjectStatus;
  startDate: string;
  estimatedEndDate: string;
  currency: string;
  /** RF-01: GeoJSON Polygon of the plot ([lon, lat] rings); absent when not drawn. */
  plotPolygon?: PlotPolygon;
  /** RF-01: the producer's COP wallet; the productor line pays here. */
  producerWalletAddress?: string;
  // RF-21 / D-05: share of each milestone budget kept as contingency reserve, in basis points (500 = 5 %). Absent = no reserve.
  // Frontend only: our backend does not store it yet (it never sends contingency_bps).
  contingencyBps?: number | null;
}

export interface PlotPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}
