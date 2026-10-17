// Order lines the producer confirmed through the assistant (RF-34), as the operator or fiduciaria sees them for approval.
// Pure functions over Intent: the decision lives in the intent's result, next to the producer's confirmation.

import { DomainError } from "../../../shared/domain-errors";
import { INTENT_STATUS, INTENT_TYPE, type Intent, type OrderLinePayload } from "./assistant";

export const ORDER_APPROVAL = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected" } as const;
export type OrderApproval = (typeof ORDER_APPROVAL)[keyof typeof ORDER_APPROVAL];

/** Pesos are whole COP, like the intent payload. */
export type OrderIntent = OrderLinePayload & {
  id: string;
  /** The producer who confirmed it with the PIN. */
  requestedBy: string;
  confirmedAt: Date | null;
  approval: OrderApproval;
  /** The proveedor line the approval created. */
  lineId: string | null;
  reason: string | null;
  /** Operator or fiduciaria who approved or rejected it. */
  decidedBy: string | null;
  decidedAt: Date | null;
};

export type OrderDecision = {
  approval: typeof ORDER_APPROVAL.APPROVED | typeof ORDER_APPROVAL.REJECTED;
  lineId: string | null;
  reason: string | null;
  by: string;
  at: Date;
};

const isOrderLine = (i: Intent): i is Intent & { type: typeof INTENT_TYPE.ORDER_LINE; data: OrderLinePayload } =>
  i.type === INTENT_TYPE.ORDER_LINE && i.status === INTENT_STATUS.CONFIRMED;

const text = (v: unknown) => (typeof v === "string" ? v : null);

export function toOrderIntent(intent: Intent): OrderIntent | null {
  if (!isOrderLine(intent)) return null;
  const r = intent.result ?? {};
  const approval = Object.values(ORDER_APPROVAL).find((a) => a === r.operatorApproval) ?? ORDER_APPROVAL.PENDING;
  const approvedAt = text(r.approvedAt);
  return {
    ...intent.data,
    id: intent.id,
    requestedBy: intent.userId,
    confirmedAt: intent.decidedAt,
    approval,
    lineId: text(r.lineId),
    reason: text(r.reason),
    decidedBy: text(r.approvedBy),
    decidedAt: approvedAt ? new Date(approvedAt) : null,
  };
}

export function decideOrder(intent: Intent, d: OrderDecision): Intent {
  const order = toOrderIntent(intent);
  if (!order) throw new DomainError(`Intent ${intent.id} is not a confirmed order line`);
  if (order.approval !== ORDER_APPROVAL.PENDING) throw new DomainError(`Order ${intent.id} was already ${order.approval}`);
  return { ...intent, result: { operatorApproval: d.approval, lineId: d.lineId, reason: d.reason, approvedBy: d.by, approvedAt: d.at.toISOString() } };
}
