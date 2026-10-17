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
  // RF-01: validated billetera (Open Payments wallet address) where the producer is paid. Absent on projects created before it.
  producerWallet?: string | null;
  // RF-21 / D-05: share of each milestone budget kept as contingency reserve, in basis points (500 = 5 %). Absent = no reserve.
  contingencyBps?: number | null;
}
