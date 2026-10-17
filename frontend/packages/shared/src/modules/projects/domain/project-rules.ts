import type { MilestoneStatus } from "../../milestones/domain/milestone";
import type { Project } from "./project";

export interface MilestoneProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface QuotedMilestone {
  status: MilestoneStatus;
  suppliesBudget: number;
  laborBudget: number;
  suppliesExecuted: number;
  laborExecuted: number;
}

export interface QuotationProgress {
  quoted: number;
  executed: number;
  percent: number;
}

export interface ProjectEntry {
  project: Project;
  milestones: readonly QuotedMilestone[];
}

export interface DashboardSummary {
  activeCount: number;
  finishedCount: number;
  // Sum of the quotations (target amounts) of the active projects.
  totalQuotation: number;
  milestonesCompleted: number;
  milestonesTotal: number;
  milestonePercent: number;
}

const percentOf = (part: number, whole: number): number =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;

export const isDraft = (p: Pick<Project, "currentStatus">): boolean => p.currentStatus === "DRAFT";

export const isFinished = (p: Pick<Project, "currentStatus">): boolean => p.currentStatus === "SETTLED_AND_CLOSED";

// Drafts and cancelled or disputed projects are neither active nor finished.
export const isActive = (p: Pick<Project, "currentStatus">): boolean =>
  p.currentStatus !== "SETTLED_AND_CLOSED" && p.currentStatus !== "CANCELLED_OR_DISPUTED" && p.currentStatus !== "DRAFT";

// A project's quotation is the sum of its milestones' supplies + labor quotations.
export function quotationProgress(milestones: readonly QuotedMilestone[]): QuotationProgress {
  const quoted = milestones.reduce((sum, m) => sum + m.suppliesBudget + m.laborBudget, 0);
  const executed = milestones.reduce((sum, m) => sum + m.suppliesExecuted + m.laborExecuted, 0);
  return { quoted, executed, percent: percentOf(executed, quoted) };
}

export function milestoneProgress(milestones: readonly Pick<QuotedMilestone, "status">[]): MilestoneProgress {
  const completed = milestones.filter((m) => m.status === "COMPLETED_AND_PAID").length;
  return { completed, total: milestones.length, percent: percentOf(completed, milestones.length) };
}

// Drafts (and cancelled projects) are excluded from every figure: nothing has been quoted into execution yet.
export function dashboardSummary(entries: readonly ProjectEntry[]): DashboardSummary {
  const counted = entries.filter((e) => isActive(e.project) || isFinished(e.project));
  const totalQuotation = entries.filter((e) => isActive(e.project)).reduce((sum, e) => sum + e.project.targetAmount, 0);
  const progress = milestoneProgress(counted.flatMap((e) => e.milestones));
  return {
    activeCount: entries.filter((e) => isActive(e.project)).length,
    finishedCount: entries.filter((e) => isFinished(e.project)).length,
    totalQuotation,
    milestonesCompleted: progress.completed,
    milestonesTotal: progress.total,
    milestonePercent: progress.percent,
  };
}

// ---- negotiation support ----

// A project can be negotiated while it is being set up or funded; once its payment is authorized it is closed to it.
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
