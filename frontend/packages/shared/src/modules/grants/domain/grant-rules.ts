import type { GrantMilestoneRef, MilestoneGrant } from "./grant";

// Pure rules of the per-milestone grant lifecycle. All amounts are integers.

// A grant that still holds a live permission (nothing else may be requested for the same milestone and investor).
export const isLive = (grant: Pick<MilestoneGrant, "status">): boolean => grant.status === "PENDING_APPROVAL" || grant.status === "ACTIVE";

export const remainingCap = (grant: Pick<MilestoneGrant, "capAmount" | "spent">): number => Math.max(0, grant.capAmount - grant.spent);

// Whole percentage of the cap already spent (integer arithmetic, capped at 100).
export function spentPercent(grant: Pick<MilestoneGrant, "capAmount" | "spent">): number {
  if (grant.capAmount <= 0) return 0;
  return Math.min(100, Math.floor((grant.spent * 100) / grant.capAmount));
}

// Idempotency key of a payment: one per milestone line (RF-11).
export const idempotencyKey = (milestoneId: string, lineId: string): string => `${milestoneId}:${lineId}`;

// Estimated commission of one payment, per currency (the PoC observed 0 in COP and 1.00 in EUR).
export function estimatedFee(currency: string): number {
  return currency === "EUR" ? 100 : 0;
}

// A payment fits when what it debits (received + commission) does not pass what is left of the cap.
export const fitsInCap = (grant: Pick<MilestoneGrant, "capAmount" | "spent">, debited: number): boolean => debited <= remainingCap(grant);

// Only a live, approved grant has something to cancel; only a pending one can be approved or denied.
export const canRevoke = (grant: Pick<MilestoneGrant, "status">): boolean => grant.status === "ACTIVE";
export const canApprove = (grant: Pick<MilestoneGrant, "status">): boolean => grant.status === "PENDING_APPROVAL";

// Terminal milestone statuses of the milestones module: nothing left to fund.
const CLOSED_MILESTONE_STATUSES = new Set(["COMPLETED_AND_PAID"]);

export type MilestoneGrantState =
  // The milestone has a grant that is pending approval or active.
  | { kind: "live"; grant: MilestoneGrant }
  // The grant of the milestone was revoked: the milestone is closed for funding.
  | { kind: "revoked"; grant: MilestoneGrant }
  // The milestone has nothing left to fund (already paid).
  | { kind: "closed" }
  // An earlier milestone has no revoked grant yet, so this one cannot be requested.
  | { kind: "blocked"; previous: GrantMilestoneRef }
  // Can be requested now (its last grant, if any, was denied or expired).
  | { kind: "eligible"; last: MilestoneGrant | null };

// Grant state of every milestone of a project for one investor. At most one milestone is `eligible` at a time: the
// grant of milestone N+1 is only requested after the grant of milestone N is revoked.
export function milestoneGrantStates(milestones: GrantMilestoneRef[], grants: MilestoneGrant[]): Map<string, MilestoneGrantState> {
  const ordered = [...milestones].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const states = new Map<string, MilestoneGrantState>();
  let gate: GrantMilestoneRef | null = null; // first milestone whose grant is not revoked yet
  for (const milestone of ordered) {
    const mine = grants.filter((g) => g.milestoneId === milestone.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const live = mine.find(isLive);
    const revoked = mine.find((g) => g.status === "REVOKED");
    let state: MilestoneGrantState;
    if (live) state = { kind: "live", grant: live };
    else if (revoked) state = { kind: "revoked", grant: revoked };
    else if (gate) state = { kind: "blocked", previous: gate };
    else if (CLOSED_MILESTONE_STATUSES.has(milestone.status)) state = { kind: "closed" };
    else state = { kind: "eligible", last: mine[0] ?? null };
    if (state.kind !== "revoked" && state.kind !== "closed" && !gate) gate = milestone;
    states.set(milestone.id, state);
  }
  return states;
}
