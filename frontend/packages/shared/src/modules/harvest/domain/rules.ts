import type { MilestoneProgress, OrderStatus, PurchaseOrder } from "./harvest";

// A harvest can be declared only while the project is running and every milestone is closed and paid.
export const DECLARABLE_PROJECT_STATUSES = ["IN_EXECUTION", "FUNDED_IN_CUSTODY"] as const;

export type DeclarationBlocker =
  | { kind: "project_status"; status: string }
  | { kind: "no_milestones" }
  | { kind: "milestone_pending"; milestoneId: string; title: string; status: string };

export function declarationBlockers(projectStatus: string, milestones: MilestoneProgress[]): DeclarationBlocker[] {
  const blockers: DeclarationBlocker[] = [];
  if (!(DECLARABLE_PROJECT_STATUSES as readonly string[]).includes(projectStatus)) blockers.push({ kind: "project_status", status: projectStatus });
  if (milestones.length === 0) blockers.push({ kind: "no_milestones" });
  for (const m of [...milestones].sort((a, b) => a.sequenceOrder - b.sequenceOrder)) {
    if (m.status !== "COMPLETED_AND_PAID") blockers.push({ kind: "milestone_pending", milestoneId: m.id, title: m.title, status: m.status });
  }
  return blockers;
}

// Integer math: kilograms x price per kilogram.
export const orderTotal = (quantityKg: number, unitPrice: number): number => quantityKg * unitPrice;

export const isGrantLive = (o: PurchaseOrder): boolean => o.grant.state === "LIVE";
export const isGrantRevoked = (o: PurchaseOrder): boolean => o.grant.state === "REVOKED_BY_BUYER";

const OPEN_STATUSES: OrderStatus[] = ["AWAITING_PAYMENT_AUTHORIZATION", "PAYMENT_AUTHORIZED", "DISPATCHED", "RECEIVED_CONFIRMED"];
export const isOrderOpen = (o: PurchaseOrder): boolean => OPEN_STATUSES.includes(o.status);

// The buyer approves the grant at the start, or again after revoking it before reception.
export const canAuthorize = (o: PurchaseOrder): boolean =>
  o.status === "AWAITING_PAYMENT_AUTHORIZATION" || ((o.status === "PAYMENT_AUTHORIZED" || o.status === "DISPATCHED") && isGrantRevoked(o));

export const canRevoke = (o: PurchaseOrder): boolean => (o.status === "PAYMENT_AUTHORIZED" || o.status === "DISPATCHED") && isGrantLive(o);
export const canCancel = (o: PurchaseOrder): boolean => o.status === "AWAITING_PAYMENT_AUTHORIZATION" || (o.status === "PAYMENT_AUTHORIZED" && !o.dispatch);

// PRD risk: dispatch only with a live grant.
export const canDispatch = (o: PurchaseOrder): boolean => o.status === "PAYMENT_AUTHORIZED" && isGrantLive(o);
export const dispatchBlockedByRevocation = (o: PurchaseOrder): boolean => o.status === "PAYMENT_AUTHORIZED" && isGrantRevoked(o);

// Reception triggers the split of the grant: it needs a live grant too.
export const canConfirmReception = (o: PurchaseOrder): boolean => o.status === "DISPATCHED" && isGrantLive(o);
