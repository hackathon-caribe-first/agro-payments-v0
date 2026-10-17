// Milestone business rules. Pure functions: no Nest, no I/O.
// A milestone pays N beneficiary lines in integer minor units; each line settles on its own.

import { DomainError } from "../../../shared/domain-errors";

export const MILESTONE_STATUS = {
  DRAFT: "draft",
  EVIDENCE_SUBMITTED: "evidence_submitted",
  APPROVED: "approved",
  OBSERVADO: "observado",
} as const;
export type MilestoneStatus = (typeof MILESTONE_STATUS)[keyof typeof MILESTONE_STATUS];

export const LINE_STATUS = {
  PENDIENTE: "pendiente",
  EN_COLA: "en_cola",
  COMPLETADO: "completado",
  FALLIDO: "fallido",
} as const;
export type LineStatus = (typeof LINE_STATUS)[keyof typeof LINE_STATUS];

export const LINE_KIND = {
  PRODUCTOR: "productor",
  PROVEEDOR: "proveedor",
  TRABAJADORES: "trabajadores",
  PLATAFORMA: "plataforma",
} as const;
export type LineKind = (typeof LINE_KIND)[keyof typeof LINE_KIND];

export type Decision = "approved" | "observado";

export type Line = {
  id: string;
  kind: LineKind;
  beneficiary: string;
  walletAddress: string;
  /** Integer minor units (see Milestone.assetScale) */
  amount: number;
  status: LineStatus;
  reference: string | null;
  settledAt: Date | null;
};

export type Milestone = {
  id: string;
  title: string;
  /** Integer minor units: amount / 10^assetScale is the human value. */
  amount: number;
  currency: string;
  assetScale: number;
  status: MilestoneStatus;
  evidence: { description: string; submittedAt: Date } | null;
  review: { decision: Decision; reason: string | null; reviewedAt: Date } | null;
  lines: Line[];
  /** Set once every line is final (completado or fallido). */
  closedAt: Date | null;
};

export type LineInput = Pick<Line, "id" | "kind" | "beneficiary" | "walletAddress" | "amount">;

export type MilestoneInput = {
  id: string;
  title: string;
  amount: number;
  currency?: string;
  assetScale?: number;
  lines: LineInput[];
};

const isFinal = (l: Line) => l.status === LINE_STATUS.COMPLETADO || l.status === LINE_STATUS.FALLIDO;
const isMinorUnits = (n: number) => Number.isSafeInteger(n) && n > 0;

export function createMilestone(input: MilestoneInput): Milestone {
  const { lines } = input;
  if (!isMinorUnits(input.amount)) throw new DomainError("Amount must be a positive safe integer in minor units");
  if (!lines.every((l) => isMinorUnits(l.amount))) throw new DomainError("Line amounts must be positive safe integers in minor units");
  if (lines.reduce((sum, l) => sum + l.amount, 0) !== input.amount) throw new DomainError("Lines must sum to the milestone amount");
  if (lines.filter((l) => l.kind === LINE_KIND.PRODUCTOR).length !== 1) throw new DomainError("A milestone needs exactly one productor line");
  if (lines.filter((l) => l.kind === LINE_KIND.PLATAFORMA).length > 1) throw new DomainError("A milestone allows at most one plataforma line");
  return {
    id: input.id,
    title: input.title,
    amount: input.amount,
    currency: input.currency ?? "COP",
    assetScale: input.assetScale ?? 2,
    status: MILESTONE_STATUS.DRAFT,
    evidence: null,
    review: null,
    lines: lines.map((l) => ({ ...l, status: LINE_STATUS.PENDIENTE, reference: null, settledAt: null })),
    closedAt: null,
  };
}

export function submitEvidence(m: Milestone, description: string, now: Date): Milestone {
  if (m.status !== MILESTONE_STATUS.DRAFT && m.status !== MILESTONE_STATUS.OBSERVADO) {
    throw new DomainError(`Milestone ${m.id} cannot receive evidence while ${m.status}`);
  }
  if (!description.trim()) throw new DomainError("Evidence needs a description");
  return { ...m, status: MILESTONE_STATUS.EVIDENCE_SUBMITTED, evidence: { description: description.trim(), submittedAt: now }, review: null };
}

export function review(m: Milestone, decision: Decision, reason: string | null, now: Date): Milestone {
  if (m.status !== MILESTONE_STATUS.EVIDENCE_SUBMITTED) throw new DomainError(`Milestone ${m.id} has no evidence to review`);
  if (decision === "observado" && !reason?.trim()) throw new DomainError("An observation needs a reason");
  return { ...m, status: decision, review: { decision, reason: reason?.trim() || null, reviewedAt: now } };
}

// Supplier lines can be paid any time before the milestone closes; the producer line only after approval.
export function assertLinePayable(m: Milestone, lineId: string): Line {
  const line = m.lines.find((l) => l.id === lineId);
  if (!line) throw new DomainError(`Line ${lineId} not found in milestone ${m.id}`);
  if (m.closedAt) throw new DomainError(`Milestone ${m.id} is closed`);
  if (line.status !== LINE_STATUS.PENDIENTE) throw new DomainError(`Line ${lineId} is ${line.status}, not pendiente`);
  if (line.kind === LINE_KIND.PRODUCTOR && m.status !== MILESTONE_STATUS.APPROVED) {
    throw new DomainError("The producer line is released only after the verifier approves the milestone");
  }
  return line;
}

// Applies a gateway result to a line that is still open (pendiente or en_cola) and closes the milestone when all lines are final.
export function applyLineResult(
  m: Milestone,
  lineId: string,
  result: { status: Exclude<LineStatus, "pendiente">; reference: string | null },
  now: Date,
): Milestone {
  const line = m.lines.find((l) => l.id === lineId);
  if (!line) throw new DomainError(`Line ${lineId} not found in milestone ${m.id}`);
  if (isFinal(line)) throw new DomainError(`Line ${lineId} is already ${line.status}`);
  const updated: Line = {
    ...line,
    status: result.status,
    reference: result.reference,
    settledAt: result.status === LINE_STATUS.EN_COLA ? null : now,
  };
  const lines = m.lines.map((l) => (l.id === lineId ? updated : l));
  return { ...m, lines, closedAt: lines.every(isFinal) ? now : null };
}
