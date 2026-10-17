import type { ProjectStatus } from "../../projects/domain/project";
import type { Actor, Proposal, ProposalRevision, ProposalStatus, RevisionStatus } from "./investment";
import type { ProposeBlock } from "./errors";
import { ACTION_ACTOR, PROPOSAL_TRANSITIONS, nextStatus } from "./transitions";

// Local yyyy-mm-dd. Rules receive `today` as an argument so they stay pure and the clock is injectable.
export function isoToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// ---- catalog and proposing ----

// Projects an investor can browse: being set up or being funded. Everything else (in execution, harvested, settled,
// cancelled) is not open to new investment.
export const INVESTOR_VISIBLE_STATUSES: readonly ProjectStatus[] = ["DRAFT", "CONTRACT_SIGNED", "FUNDING_IN_PROGRESS"];

export const isVisibleToInvestors = (status: ProjectStatus): boolean => INVESTOR_VISIBLE_STATUSES.includes(status);

// An investor can propose on a visible project that has no accepted proposal yet and where they have no live proposal.
export function proposeBlock(input: { projectStatus: ProjectStatus; contractLocked: boolean; hasLive: boolean }): ProposeBlock | null {
  if (!isVisibleToInvestors(input.projectStatus)) return "project_status";
  if (input.contractLocked) return "contract_exists";
  if (input.hasLive) return "duplicate";
  return null;
}

// ---- yield (basis points, integer math only) ----

export const MAX_YIELD_BPS = 5000;

// "14", "14,5" and "14.25" read as basis points (1400, 1450, 1425). Anything else is not a yield.
export function parseYieldBps(text: string): number | null {
  const match = text.trim().match(/^(\d{1,3})(?:[.,](\d{1,2}))?$/);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

// 1450 -> "14,5"; es-CO decimal comma, trailing zeros dropped.
export function yieldToInput(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole},${fraction}` : String(whole);
}

export const formatYield = (bps: number): string => `${yieldToInput(bps)} %`;

// The agreed yield in money: amount * bps / 10 000, floored so it never promises a fraction of a peso.
export const yieldAmount = (amount: number, bps: number): number => Math.floor((amount * bps) / 10000);

// ---- rounds ----

// Accept, reject and counter always target the latest revision of the proposal.
export const latestRevision = (p: Pick<Proposal, "revisions">): ProposalRevision | undefined =>
  p.revisions.reduce<ProposalRevision | undefined>((best, r) => (!best || r.revision > best.revision ? r : best), undefined);

// Lazy expiry: a SENT revision is expired once validUntil is before today. Nothing is stored.
export const effectiveRevisionStatus = (r: Pick<ProposalRevision, "status" | "validUntil">, today: string): RevisionStatus =>
  r.status === "SENT" && r.validUntil < today ? "EXPIRED" : r.status;

// PROPOSED and NEGOTIATING both hold a live revision, so both can lapse. EXPIRED is final.
export function effectiveProposalStatus(p: Pick<Proposal, "status" | "revisions">, today: string): ProposalStatus {
  if (p.status !== "PROPOSED" && p.status !== "NEGOTIATING") return p.status;
  const latest = latestRevision(p);
  return latest && effectiveRevisionStatus(latest, today) === "EXPIRED" ? "EXPIRED" : p.status;
}

// Whose move it is: the non-author of the latest SENT revision. Null once the proposal has ended or lapsed.
export function whoseTurn(p: Pick<Proposal, "status" | "revisions">, today: string): Actor | null {
  const status = effectiveProposalStatus(p, today);
  if (status !== "PROPOSED" && status !== "NEGOTIATING") return null;
  const latest = latestRevision(p);
  if (!latest || latest.status !== "SENT") return null;
  return latest.author === "INVESTOR" ? "PRODUCER" : "INVESTOR";
}

export function canAct(p: Pick<Proposal, "status" | "revisions">, actor: Actor, action: string, today: string): boolean {
  if (!nextStatus(PROPOSAL_TRANSITIONS, effectiveProposalStatus(p, today), action)) return false;
  const rule = ACTION_ACTOR[action];
  if (rule === "SYSTEM" || rule === undefined) return false;
  if (rule === "TURN") return whoseTurn(p, today) === actor;
  return rule === actor;
}

export const canCounter = (p: Pick<Proposal, "status" | "revisions">, actor: Actor, today: string) => canAct(p, actor, "counter", today);
export const canWithdraw = (p: Pick<Proposal, "status" | "revisions">, actor: Actor, today: string) => canAct(p, actor, "withdraw", today);

// A live proposal can still move (not accepted, rejected, withdrawn or expired).
export const isProposalLive = (p: Pick<Proposal, "status" | "revisions">, today: string): boolean =>
  nextStatus(PROPOSAL_TRANSITIONS, effectiveProposalStatus(p, today), "withdraw") !== null;

// A counter must move the money terms: amount or yield. Validity and notes alone do not make a new offer.
export const counterChangesATerm = (
  latest: Pick<ProposalRevision, "amount" | "yieldBps">,
  next: Pick<ProposalRevision, "amount" | "yieldBps">,
): boolean => latest.amount !== next.amount || latest.yieldBps !== next.yieldBps;

// A producer only sees proposals addressed to them; an investor only their own.
export const isParty = (p: Pick<Proposal, "investorId" | "producerId">, party: "INVESTOR" | "PRODUCER", partyId: string): boolean =>
  party === "INVESTOR" ? p.investorId === partyId : p.producerId === partyId;
