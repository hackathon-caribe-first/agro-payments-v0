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
}
