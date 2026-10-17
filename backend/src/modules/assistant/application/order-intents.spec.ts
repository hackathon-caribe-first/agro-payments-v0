import { DomainError } from "../../../shared/domain-errors";
import { INTENT_STATUS, INTENT_TYPE, type Intent } from "./assistant";
import { decideOrder, ORDER_APPROVAL, toOrderIntent } from "./order-intents";

const now = new Date("2026-10-17T10:00:00Z");
const confirmed = (overrides: Partial<Intent> = {}): Intent =>
  ({
    id: "i-1",
    conversationId: "c-1",
    userId: "u-prod",
    type: INTENT_TYPE.ORDER_LINE,
    data: { milestoneId: "p1-ms-1", milestoneTitle: "Fertilización", supplier: "Almacén Don Pedro", product: "urea", quantity: 20, unit: "bultos", unitPrice: 125_000, total: 2_500_000 },
    summary: "Orden",
    requiresPin: true,
    status: INTENT_STATUS.CONFIRMED,
    createdAt: now,
    decidedAt: now,
    decidedBy: "u-prod",
    result: { operatorApproval: "pending" },
    ...overrides,
  }) as Intent;

describe("toOrderIntent", () => {
  it("reads a confirmed order line intent as a pending order", () => {
    expect(toOrderIntent(confirmed())).toEqual({
      id: "i-1",
      milestoneId: "p1-ms-1",
      milestoneTitle: "Fertilización",
      supplier: "Almacén Don Pedro",
      product: "urea",
      quantity: 20,
      unit: "bultos",
      unitPrice: 125_000,
      total: 2_500_000,
      requestedBy: "u-prod",
      confirmedAt: now,
      approval: ORDER_APPROVAL.PENDING,
      lineId: null,
      reason: null,
      decidedBy: null,
      decidedAt: null,
    });
  });

  it("ignores intents that are not confirmed order lines", () => {
    expect(toOrderIntent(confirmed({ status: INTENT_STATUS.PENDING }))).toBeNull();
    expect(toOrderIntent(confirmed({ type: INTENT_TYPE.MILESTONE_EVIDENCE } as Partial<Intent>))).toBeNull();
  });
});

describe("decideOrder", () => {
  it("records the operator's approval with the created line in the intent result, keeping the producer's confirmation", () => {
    const decided = decideOrder(confirmed(), { approval: ORDER_APPROVAL.APPROVED, lineId: "p1-ms-1-order-i-1", reason: null, by: "u-fidu", at: now });
    expect(decided).toMatchObject({ status: INTENT_STATUS.CONFIRMED, decidedBy: "u-prod" });
    expect(decided.result).toEqual({ operatorApproval: "approved", lineId: "p1-ms-1-order-i-1", reason: null, approvedBy: "u-fidu", approvedAt: now.toISOString() });
    expect(toOrderIntent(decided)).toMatchObject({ approval: "approved", lineId: "p1-ms-1-order-i-1", decidedBy: "u-fidu", decidedAt: now });
  });

  it("refuses to decide twice or to decide what is not a confirmed order", () => {
    const rejected = decideOrder(confirmed(), { approval: ORDER_APPROVAL.REJECTED, lineId: null, reason: "Sin factura", by: "u-admin", at: now });
    expect(toOrderIntent(rejected)).toMatchObject({ approval: "rejected", reason: "Sin factura" });
    expect(() => decideOrder(rejected, { approval: ORDER_APPROVAL.APPROVED, lineId: "x", reason: null, by: "u-admin", at: now })).toThrow(DomainError);
    expect(() => decideOrder(confirmed({ status: INTENT_STATUS.REJECTED }), { approval: ORDER_APPROVAL.APPROVED, lineId: "x", reason: null, by: "u", at: now })).toThrow(DomainError);
  });
});
