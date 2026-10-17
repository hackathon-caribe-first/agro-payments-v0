import { DEPOSIT_TRANSITIONS, nextStatus } from "./transitions";
import type { Actor, CatalogProject, DepositState, OfferTerms, QuoteRequest, RequestStatus } from "./presale";
import { isNegotiationActive } from "./presale-rules";
import { isMilestoneNegotiable, isProjectNegotiable, type MilestoneStatus, type Project } from "./project-rules";

// Pure rules of the project negotiation (Flow A). `today` is always injected.

export const isAgreed = (n: Pick<QuoteRequest, "status">): boolean => n.status === "ACCEPTED";

// ---- starting ----

export type StartBlock = "own_project" | "project_status" | "project_agreed" | "milestone_status" | "milestone_agreed" | "duplicate";

export interface StartContext {
  project: Pick<Project, "currentStatus">;
  milestone: { id: string; status: MilestoneStatus } | null;
  // Server-derived locks of the catalog entry.
  negotiationLocked: boolean;
  agreedMilestoneIds: readonly string[];
  // The producer that owns the project, and the party trying to start (a producer is never allowed to).
  ownerId: string | null;
  starterId: string;
  // The starter already has a live negotiation on this target.
  hasLive: boolean;
}

// Why a negotiation cannot be started, or null when it can.
export function canStart(c: StartContext): StartBlock | null {
  if (c.ownerId !== null && c.starterId === c.ownerId) return "own_project";
  if (!isProjectNegotiable(c.project.currentStatus)) return "project_status";
  if (c.negotiationLocked) return "project_agreed";
  if (c.milestone) {
    if (!isMilestoneNegotiable(c.milestone.status)) return "milestone_status";
    if (c.agreedMilestoneIds.includes(c.milestone.id)) return "milestone_agreed";
  }
  if (c.hasLive) return "duplicate";
  return null;
}

// At most one live negotiation per buyer per target (project for PROJECT scope, milestone for MILESTONE scope).
export const hasLiveNegotiation = (
  negotiations: readonly Pick<QuoteRequest, "status" | "quotes" | "buyerId" | "scope" | "targetId" | "origin">[],
  buyerId: string,
  scope: "PROJECT" | "MILESTONE",
  targetId: string,
  today: string,
): boolean =>
  negotiations.some(
    (n) => n.origin === "PROJECT_INTEREST" && n.buyerId === buyerId && n.scope === scope && n.targetId === targetId && isNegotiationActive(n, today),
  );

// The live negotiation of this buyer on a target, if any (to link to it).
export const findLiveNegotiation = <N extends Pick<QuoteRequest, "status" | "quotes" | "buyerId" | "scope" | "targetId" | "origin">>(
  negotiations: readonly N[],
  buyerId: string,
  scope: "PROJECT" | "MILESTONE",
  targetId: string,
  today: string,
): N | null =>
  negotiations.find(
    (n) => n.origin === "PROJECT_INTEREST" && n.buyerId === buyerId && n.scope === scope && n.targetId === targetId && isNegotiationActive(n, today),
  ) ?? null;

// ---- counters ----

// A counter must differ from the latest offer in at least one term. Validity and notes do not count.
export function counterChangesATerm(latest: OfferTerms, next: OfferTerms): boolean {
  if (latest.kind === "PROJECT" && next.kind === "PROJECT") {
    return latest.quantity !== next.quantity || latest.unit !== next.unit || latest.unitPrice !== next.unitPrice || latest.deliveryDate !== next.deliveryDate;
  }
  if (latest.kind === "MILESTONE" && next.kind === "MILESTONE") {
    return latest.price !== next.price || latest.deliveryDate !== next.deliveryDate;
  }
  return true;
}

// ---- agreement ----

// Prices agreed by this buyer on milestones: only ACCEPTED MILESTONE negotiations count.
export function agreedMilestonePrices(negotiations: readonly QuoteRequest[], buyerId: string): Map<string, number> {
  const prices = new Map<string, number>();
  for (const n of negotiations) {
    if (n.origin !== "PROJECT_INTEREST" || n.scope !== "MILESTONE" || n.buyerId !== buyerId || !isAgreed(n) || !n.milestoneId) continue;
    const accepted = n.quotes.find((q) => q.status === "ACCEPTED");
    if (accepted?.terms.kind === "MILESTONE") prices.set(n.milestoneId, accepted.terms.price);
  }
  return prices;
}

export type AgreeBlock = "project_status" | "project_agreed" | "milestone_status" | "milestone_agreed";

// Re-checked when an offer is accepted: things may have changed since it was sent.
export function canAgree(c: {
  scope: "PROJECT" | "MILESTONE";
  project: Pick<Project, "currentStatus">;
  milestone: { id: string; status: MilestoneStatus } | null;
  negotiationLocked: boolean;
  agreedMilestoneIds: readonly string[];
}): AgreeBlock | null {
  if (!isProjectNegotiable(c.project.currentStatus)) return "project_status";
  if (c.negotiationLocked) return "project_agreed";
  if (c.scope === "MILESTONE" && c.milestone) {
    if (!isMilestoneNegotiable(c.milestone.status)) return "milestone_status";
    if (c.agreedMilestoneIds.includes(c.milestone.id)) return "milestone_agreed";
  }
  return null;
}

// ---- deposit ----

export type DepositBlock = "not_project" | "not_agreed" | "already_deposited" | "not_owner" | "project_status" | "no_total";

export function canDeposit(
  n: Pick<QuoteRequest, "scope" | "status" | "buyerId" | "deposit" | "origin">,
  actor: Actor,
  buyerId: string,
  project: Pick<Project, "currentStatus">,
): DepositBlock | null {
  if (n.origin !== "PROJECT_INTEREST" || n.scope !== "PROJECT") return "not_project";
  if (!isAgreed(n) || !n.deposit) return "not_agreed";
  if (actor !== "BUYER" || n.buyerId !== buyerId) return "not_owner";
  if (n.deposit.status === "DEPOSITED") return "already_deposited";
  if (!nextStatus(DEPOSIT_TRANSITIONS, n.deposit.status, "deposit")) return "not_agreed";
  if (n.deposit.agreedTotal <= 0) return "no_total";
  if (project.currentStatus === "CANCELLED_OR_DISPUTED") return "project_status";
  return null;
}

export const isDepositPending = (d: DepositState | null): boolean => d?.status === "PENDING";

// ---- auto-close ----

// Live negotiations closed by an agreement. PROJECT: every other live project negotiation on the same project (both
// scopes, any buyer). MILESTONE: every other live negotiation on the same milestone. Open-request negotiations are never closed.
export function autoCloseOthers(negotiations: readonly QuoteRequest[], agreed: QuoteRequest, today: string): string[] {
  return negotiations
    .filter(
      (n) =>
        n.id !== agreed.id &&
        n.origin === "PROJECT_INTEREST" &&
        n.projectId === agreed.projectId &&
        isNegotiationActive(n, today) &&
        (agreed.scope === "PROJECT" || (agreed.scope === "MILESTONE" && n.milestoneId === agreed.milestoneId)),
    )
    .map((n) => n.id);
}

// ---- views ----

export type AutoClosedBy = "PROJECT" | "MILESTONE";

export const AUTO_CLOSE_LABELS: Record<AutoClosedBy, string> = {
  PROJECT: "Cerrada por acuerdo del proyecto",
  MILESTONE: "Cerrada por acuerdo del hito",
};

// A system-closed negotiation is CANCELLED on the wire; the last history entry tells why.
export function autoClosedBy(n: Pick<QuoteRequest, "status" | "history">): AutoClosedBy | null {
  if (n.status !== "CANCELLED") return null;
  const last = n.history[n.history.length - 1];
  if (!last || last.kind !== "AUTO_CLOSE") return null;
  return last.payload?.reason === "MILESTONE" ? "MILESTONE" : "PROJECT";
}

export interface NegotiationView {
  status: RequestStatus;
  autoClosedBy: AutoClosedBy | null;
}

export const negotiationView = (n: Pick<QuoteRequest, "status" | "history">): NegotiationView => ({
  status: n.status,
  autoClosedBy: autoClosedBy(n),
});

// Derives the catalog locks from the agreed project negotiations.
export function catalogLocks(
  negotiations: readonly Pick<QuoteRequest, "origin" | "projectId" | "status" | "scope" | "milestoneId">[],
  projectId: string,
): Pick<CatalogProject, "negotiationLocked" | "agreedMilestoneIds"> {
  const agreed = negotiations.filter((n) => n.origin === "PROJECT_INTEREST" && n.projectId === projectId && isAgreed(n));
  return {
    negotiationLocked: agreed.some((n) => n.scope === "PROJECT"),
    agreedMilestoneIds: agreed.filter((n) => n.scope === "MILESTONE" && n.milestoneId).map((n) => n.milestoneId as string),
  };
}
