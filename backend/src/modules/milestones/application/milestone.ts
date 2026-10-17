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

/** History entry kinds; the /api maps them to the PRD verdicts (SUBMITTED, CHANGES_REQUESTED, APPROVED_FAVORABLE, PAYOUT_EXECUTED). */
export const REVIEW_VERDICT = {
  SUBMITTED: "submitted",
  OBSERVADO: "observado",
  APPROVED: "approved",
  PAYOUT_EXECUTED: "payout_executed",
} as const;
export type ReviewVerdict = (typeof REVIEW_VERDICT)[keyof typeof REVIEW_VERDICT];

export type ReviewEntry = { id: string; verdict: ReviewVerdict; comment: string | null; createdAt: Date };

export const LOG_TYPE = {
  PHOTO_EVIDENCE: "PHOTO_EVIDENCE",
  SOIL_ANALYSIS: "SOIL_ANALYSIS",
  IOT_READING: "IOT_READING",
  WEATHER_ALERT: "WEATHER_ALERT",
  AGRONOMIC_NOTE: "AGRONOMIC_NOTE",
} as const;
export type LogType = (typeof LOG_TYPE)[keyof typeof LOG_TYPE];

export type EvidenceValue = number | boolean | string[];
export type EvidencePayload = Record<string, EvidenceValue>;

export type EvidenceLog = { id: string; logType: LogType; notes: string; evidencePayload: EvidencePayload; createdAt: Date };

export const REQUIREMENT_TYPE = { NUMBER: "number", BOOLEAN_SYSTEM_CHECK: "boolean_system_check", PHOTO_ARRAY: "photo_array" } as const;

/** PRD required_evidences: what the logs must show before the milestone can be submitted. */
export type Requirement =
  | { fieldKey: string; label: string; type: typeof REQUIREMENT_TYPE.NUMBER; min?: number; max?: number }
  | { fieldKey: string; label: string; type: typeof REQUIREMENT_TYPE.BOOLEAN_SYSTEM_CHECK }
  | { fieldKey: string; label: string; type: typeof REQUIREMENT_TYPE.PHOTO_ARRAY; minItems: number };

/** An amount in integer minor units of its own asset. */
export interface ReceiptAmount {
  value: number;
  assetCode: string;
  assetScale: number;
}

/** RF-23: what the gateway reports for one line payment; every field is null until known. */
export type LineReceipt = {
  incomingPaymentId: string | null;
  outgoingPaymentId: string | null;
  quoteId: string | null;
  /** Charged to the custody grant for this line. */
  debitAmount: ReceiptAmount | null;
  /** Credited to the beneficiary (quoted first, settled later). */
  receiveAmount: ReceiptAmount | null;
  /** Implied rate receive/debit in major units, as a reduced "numerator/denominator" string (never a float). */
  rate: string | null;
  /** debit − receive in debit minor units; only when both are in the same asset. */
  fee: number | null;
  /** Grant debit total right before and after this payment, as the wallet reports it. */
  grantSpentBefore: number | null;
  grantSpentAfter: number | null;
};

/** What one gateway answer adds to the receipt; the rate and fee are always derived, never reported. */
export type LineReceiptUpdate = Partial<Omit<LineReceipt, "rate" | "fee">>;

export type LineResult = { status: Exclude<LineStatus, "pendiente">; reference: string | null; receipt?: LineReceiptUpdate };

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
  receipt: LineReceipt | null;
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
  /** Set when the custody wallet's outgoing-payment grant that funds every line is approved. */
  fundedAt: Date | null;
  /** Set once approved with every line final (completado or fallido); closing revokes the grant (RF-22). */
  closedAt: Date | null;
  /** Null for the legacy demo milestones, which belong to no project. */
  projectId: string | null;
  /** 1-based position in its project; milestones open in this order. */
  sequenceOrder: number | null;
  description: string;
  /** ISO yyyy-mm-dd. */
  estimatedCompletionDate: string | null;
  requirements: Requirement[];
  /** Append-only field log (PRD evidence_logs). */
  evidenceLogs: EvidenceLog[];
  /** Append-only verdict history (PRD milestone reviews); `review` above stays the latest decision. */
  reviews: ReviewEntry[];
};

export type LineInput = Pick<Line, "id" | "kind" | "beneficiary" | "walletAddress" | "amount">;

export type MilestoneInput = {
  id: string;
  title: string;
  amount: number;
  currency?: string;
  assetScale?: number;
  lines: LineInput[];
  projectId?: string | null;
  sequenceOrder?: number | null;
  description?: string;
  estimatedCompletionDate?: string | null;
  requirements?: Requirement[];
};

const isFinal = (l: Line) => l.status === LINE_STATUS.COMPLETADO || l.status === LINE_STATUS.FALLIDO;
const isMinorUnits = (n: number) => Number.isSafeInteger(n) && n > 0;
const allocated = (lines: readonly Pick<Line, "amount">[]) => lines.reduce((sum, l) => sum + l.amount, 0);

/** What the grant cap still leaves for new supplier lines, in minor units. */
export const remainingCap = (m: Pick<Milestone, "amount" | "lines">) => m.amount - allocated(m.lines);

/**
 * RF-21 / RF-27: what left custody under this milestone's grant — lines completado or en_cola (a queued payment already debits the
 * grant), at the debit the wallet reported when it is in the milestone's asset, else the line amount.
 */
export const spentFromCustody = (m: Pick<Milestone, "currency" | "lines">) =>
  m.lines
    .filter((l) => l.status === LINE_STATUS.COMPLETADO || l.status === LINE_STATUS.EN_COLA)
    .reduce((sum, l) => sum + (l.receipt?.debitAmount && l.receipt.debitAmount.assetCode === m.currency ? l.receipt.debitAmount.value : l.amount), 0);

// RF-22: closed means approved with every existing line final; closing is what revokes the grant.
const closedAtIfDone = (status: MilestoneStatus, lines: readonly Line[], now: Date) =>
  status === MILESTONE_STATUS.APPROVED && lines.every(isFinal) ? now : null;

/** Lines approved during execution are paid on approval (jornales, fee); supplier lines any time the milestone is funded and open. */
const PAID_ON_APPROVAL: readonly LineKind[] = [LINE_KIND.PRODUCTOR, LINE_KIND.PLATAFORMA];

export function createMilestone(input: MilestoneInput): Milestone {
  const { lines } = input;
  if (!isMinorUnits(input.amount)) throw new DomainError("Amount must be a positive safe integer in minor units");
  if (!lines.every((l) => isMinorUnits(l.amount))) throw new DomainError("Line amounts must be positive safe integers in minor units");
  // v3 split: the amount is the grant cap; supplier lines join during execution (addSupplierLine), so Σ lines ≤ amount.
  if (allocated(lines) > input.amount) throw new DomainError("Lines cannot exceed the milestone amount");
  // Levels C and primer ciclo have no jornales line (PRD v3 "Split del hito").
  if (lines.filter((l) => l.kind === LINE_KIND.PRODUCTOR).length > 1) throw new DomainError("A milestone allows at most one productor line");
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
    lines: lines.map((l) => ({ ...l, status: LINE_STATUS.PENDIENTE, reference: null, settledAt: null, receipt: null })),
    fundedAt: null,
    closedAt: null,
    projectId: input.projectId ?? null,
    sequenceOrder: input.sequenceOrder ?? null,
    description: input.description ?? "",
    estimatedCompletionDate: input.estimatedCompletionDate ?? null,
    requirements: input.requirements ?? [],
    evidenceLogs: [],
    reviews: [],
  };
}

// Ids are scoped to the milestone and never reused: the history is append-only.
const withReview = (m: Milestone, verdict: ReviewVerdict, comment: string | null, now: Date): ReviewEntry[] => [
  ...m.reviews,
  { id: `${m.id}-rev-${m.reviews.length + 1}`, verdict, comment, createdAt: now },
];

export function fund(m: Milestone, now: Date): Milestone {
  if (m.fundedAt) throw new DomainError(`Milestone ${m.id} is already funded`);
  return { ...m, fundedAt: now };
}

export function submitEvidence(m: Milestone, description: string, now: Date): Milestone {
  if (m.status !== MILESTONE_STATUS.DRAFT && m.status !== MILESTONE_STATUS.OBSERVADO) {
    throw new DomainError(`Milestone ${m.id} cannot receive evidence while ${m.status}`);
  }
  if (!description.trim()) throw new DomainError("Evidence needs a description");
  return {
    ...m,
    status: MILESTONE_STATUS.EVIDENCE_SUBMITTED,
    evidence: { description: description.trim(), submittedAt: now },
    review: null,
    reviews: withReview(m, REVIEW_VERDICT.SUBMITTED, null, now),
  };
}

export function review(m: Milestone, decision: Decision, reason: string | null, now: Date): Milestone {
  if (m.status !== MILESTONE_STATUS.EVIDENCE_SUBMITTED) throw new DomainError(`Milestone ${m.id} has no evidence to review`);
  if (decision === "observado" && !reason?.trim()) throw new DomainError("An observation needs a reason");
  const comment = reason?.trim() || null;
  return {
    ...m,
    status: decision,
    review: { decision, reason: comment, reviewedAt: now },
    reviews: withReview(m, decision, comment, now),
    closedAt: closedAtIfDone(decision, m.lines, now),
  };
}

export type SupplierLineInput = Pick<Line, "id" | "beneficiary" | "walletAddress" | "amount">;

// RF-15/RF-16 sub-etapa A: an approved order becomes a proveedor line while the milestone executes, only if it fits the cap.
export function addSupplierLine(m: Milestone, input: SupplierLineInput): Milestone {
  if (m.closedAt) throw new DomainError(`Milestone ${m.id} is closed`);
  if (m.status !== MILESTONE_STATUS.DRAFT && m.status !== MILESTONE_STATUS.OBSERVADO) {
    throw new DomainError(`Milestone ${m.id} takes supplier lines only while it executes, not while ${m.status}`);
  }
  if (!isMinorUnits(input.amount)) throw new DomainError("Line amounts must be positive safe integers in minor units");
  if (m.lines.some((l) => l.id === input.id)) throw new DomainError(`Line ${input.id} already exists in milestone ${m.id}`);
  if (input.amount > remainingCap(m)) throw new DomainError(`The line of ${input.amount} does not fit the ${remainingCap(m)} left in milestone ${m.id}`);
  const line: Line = { ...input, kind: LINE_KIND.PROVEEDOR, status: LINE_STATUS.PENDIENTE, reference: null, settledAt: null, receipt: null };
  return { ...m, lines: [...m.lines, line] };
}

// Lines are paid only from a funded milestone. Supplier lines any time before it closes; jornales and fee only after approval (RF-20).
export function assertLinePayable(m: Milestone, lineId: string): Line {
  const line = m.lines.find((l) => l.id === lineId);
  if (!line) throw new DomainError(`Line ${lineId} not found in milestone ${m.id}`);
  if (m.closedAt) throw new DomainError(`Milestone ${m.id} is closed`);
  if (!m.fundedAt) throw new DomainError(`Milestone ${m.id} is not funded yet`);
  if (line.status !== LINE_STATUS.PENDIENTE) throw new DomainError(`Line ${lineId} is ${line.status}, not pendiente`);
  if (PAID_ON_APPROVAL.includes(line.kind) && m.status !== MILESTONE_STATUS.APPROVED) {
    throw new DomainError(`The ${line.kind} line is released only after the verifier approves the milestone`);
  }
  return line;
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

// receive/debit in major units: (receive / 10^rs) / (debit / 10^ds) = receive·10^ds / (debit·10^rs), in BigInt.
export function impliedRate(debit: ReceiptAmount, receive: ReceiptAmount): string | null {
  if (debit.value <= 0) return null;
  const numerator = BigInt(receive.value) * 10n ** BigInt(debit.assetScale);
  const denominator = BigInt(debit.value) * 10n ** BigInt(receive.assetScale);
  const divisor = gcd(numerator, denominator) || 1n;
  return `${numerator / divisor}/${denominator / divisor}`;
}

const sameAsset = (a: ReceiptAmount, b: ReceiptAmount) => a.assetCode === b.assetCode && a.assetScale === b.assetScale;

// Later answers fill what earlier ones left null; rate and fee are recomputed from the merged amounts.
export function mergeReceipt(previous: LineReceipt | null, update: LineReceiptUpdate | undefined): LineReceipt | null {
  if (!update) return previous;
  const pick = <K extends keyof LineReceiptUpdate>(key: K): LineReceipt[K] => update[key] ?? previous?.[key] ?? null;
  const debitAmount = pick("debitAmount");
  const receiveAmount = pick("receiveAmount");
  const both = debitAmount && receiveAmount ? { debitAmount, receiveAmount } : null;
  return {
    incomingPaymentId: pick("incomingPaymentId"),
    outgoingPaymentId: pick("outgoingPaymentId"),
    quoteId: pick("quoteId"),
    debitAmount,
    receiveAmount,
    rate: both ? impliedRate(both.debitAmount, both.receiveAmount) : null,
    fee: both && sameAsset(both.debitAmount, both.receiveAmount) ? both.debitAmount.value - both.receiveAmount.value : null,
    grantSpentBefore: pick("grantSpentBefore"),
    grantSpentAfter: pick("grantSpentAfter"),
  };
}

// Applies a gateway result to a line that is still open (pendiente or en_cola) and closes an approved milestone when all lines are final.
export function applyLineResult(
  m: Milestone,
  lineId: string,
  result: LineResult,
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
    receipt: mergeReceipt(line.receipt, result.receipt),
  };
  const lines = m.lines.map((l) => (l.id === lineId ? updated : l));
  const producerPaid = line.kind === LINE_KIND.PRODUCTOR && updated.status === LINE_STATUS.COMPLETADO;
  const reviews = producerPaid ? withReview(m, REVIEW_VERDICT.PAYOUT_EXECUTED, null, now) : m.reviews;
  return { ...m, lines, reviews, closedAt: closedAtIfDone(m.status, lines, now) };
}

// RF-22: a milestone's grant is revoked once it closed after approval (every line final).
// ponytail: "milestone cancelled" is the other v3 trigger; add it here when cancellation exists.
export const grantRevocable = (m: Milestone) => m.closedAt !== null && m.status === MILESTONE_STATUS.APPROVED;
