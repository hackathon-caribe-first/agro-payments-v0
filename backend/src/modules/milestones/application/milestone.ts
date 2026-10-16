// Milestone business rules. Pure functions: no Nest, no I/O.
// Approving a milestone, ordering its payment and confirming that payment are separate events.

import { DomainError } from "../../../shared/domain-errors";

export type Recipient = "productor" | "proveedor" | "trabajadores";
export type MilestoneStatus = "draft" | "evidence_submitted" | "approved" | "rejected";
export type PaymentStatus = "processing" | "confirmed";
export type Decision = "approved" | "rejected";

export type Share = { recipient: Recipient; percent: number; amount: number };

export type Milestone = {
  id: string;
  title: string;
  /** Whole currency units (COP has no cents in practice). */
  amount: number;
  currency: string;
  status: MilestoneStatus;
  evidence: { description: string; submittedAt: Date } | null;
  review: { decision: Decision; reason: string | null; reviewedAt: Date } | null;
  payment: {
    status: PaymentStatus;
    reference: string;
    shares: Share[];
    orderedAt: Date;
    confirmedAt: Date | null;
  } | null;
};

const SPLIT: ReadonlyArray<[Recipient, number]> = [
  ["productor", 50],
  ["proveedor", 30],
  ["trabajadores", 20],
];

export function distribute(amount: number): Share[] {
  const shares = SPLIT.map(([recipient, percent]) => ({
    recipient,
    percent,
    amount: Math.floor((amount * percent) / 100),
  }));
  const remainder = amount - shares.reduce((sum, s) => sum + s.amount, 0);
  shares[0].amount += remainder; // never lose a peso to rounding
  return shares;
}

export function submitEvidence(m: Milestone, description: string, now: Date): Milestone {
  if (m.status !== "draft" && m.status !== "rejected") {
    throw new DomainError(`Milestone ${m.id} cannot receive evidence while ${m.status}`);
  }
  if (!description.trim()) throw new DomainError("Evidence needs a description");
  return { ...m, status: "evidence_submitted", evidence: { description: description.trim(), submittedAt: now }, review: null };
}

export function review(m: Milestone, decision: Decision, reason: string | null, now: Date): Milestone {
  if (m.status !== "evidence_submitted") throw new DomainError(`Milestone ${m.id} has no evidence to review`);
  if (decision === "rejected" && !reason?.trim()) throw new DomainError("A rejection needs a reason");
  return { ...m, status: decision, review: { decision, reason: reason?.trim() || null, reviewedAt: now } };
}

export function orderPayment(m: Milestone, reference: string, now: Date): Milestone {
  if (m.status !== "approved") throw new DomainError(`Milestone ${m.id} is not approved`);
  if (m.payment) throw new DomainError(`Milestone ${m.id} already has a payment`);
  return {
    ...m,
    payment: { status: "processing", reference, shares: distribute(m.amount), orderedAt: now, confirmedAt: null },
  };
}

export function confirmPayment(m: Milestone, now: Date): Milestone {
  if (m.payment?.status !== "processing") throw new DomainError(`Milestone ${m.id} has no payment in process`);
  return { ...m, payment: { ...m.payment, status: "confirmed", confirmedAt: now } };
}
