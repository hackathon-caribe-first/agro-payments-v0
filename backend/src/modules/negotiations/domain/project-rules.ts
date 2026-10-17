// Ported from frontend/packages/shared/src/modules/projects/domain/project-rules.ts ("negotiation support" section only).
import type { ProgressStatus } from "../../milestones/application/milestone-progress";
import type { ProjectStatus } from "../../projects/application/project";

/** The slice of a project the negotiation rules read. */
export type Project = { currentStatus: ProjectStatus };
export type MilestoneStatus = ProgressStatus;

// A project can be negotiated while it is being set up or funded; once the custody account is funded it is closed to it.
const NEGOTIABLE_PROJECT_STATUSES: readonly Project["currentStatus"][] = ["DRAFT", "CONTRACT_SIGNED", "FUNDING_IN_PROGRESS"];

export const isProjectNegotiable = (status: Project["currentStatus"]): boolean => NEGOTIABLE_PROJECT_STATUSES.includes(status);

// A milestone whose work is already approved or paid cannot be renegotiated.
const CLOSED_MILESTONE_STATUSES: readonly MilestoneStatus[] = ["TECHNICALLY_APPROVED", "LABOR_PAYOUT_PENDING", "COMPLETED_AND_PAID"];

export const isMilestoneNegotiable = (status: MilestoneStatus): boolean => !CLOSED_MILESTONE_STATUSES.includes(status);

// The ONE function that computes a project's quotation total: each milestone counts its agreed price when it has one,
// otherwise its supplies + labor budget. Milestone budgets themselves are never rewritten.
export function projectQuotationTotal(
  milestones: readonly { id: string; suppliesBudget: number; laborBudget: number }[],
  agreedPrices: ReadonlyMap<string, number>,
): number {
  return milestones.reduce((sum, m) => sum + (agreedPrices.get(m.id) ?? m.suppliesBudget + m.laborBudget), 0);
}
