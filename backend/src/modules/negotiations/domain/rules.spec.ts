// The ported web-app rules, pinned: if a copy drifts from the app's behaviour these break first.
import { toQuoteRequest } from "./mapper";
import { autoCloseOthers, canAgree, canDeposit, canStart, catalogLocks, counterChangesATerm } from "./negotiation-rules";
import { allocationGuard, canAct, effectiveQuoteStatus, effectiveRequestStatus, isoToday, remainingToAward, whoseTurn } from "./presale-rules";
import { projectQuotationTotal } from "./project-rules";
import { nextStatus, REQUEST_TRANSITIONS } from "./transitions";
import type { QuoteRequestDto, SaleQuoteDto } from "./wire";

const quote = (revision: number, author: string, overrides: Partial<SaleQuoteDto> = {}): SaleQuoteDto => ({
  request_id: "r1",
  revision,
  author,
  unit_price: 100,
  quantity: 2,
  unit: "TON",
  currency: "COP",
  delivery_date: "2026-12-01",
  valid_until: "2026-10-30",
  status: "SENT",
  created_at: "2026-10-17T00:00:00.000Z",
  ...overrides,
});
const negotiation = (overrides: Partial<QuoteRequestDto> = {}): QuoteRequestDto => ({
  id: "r1",
  origin: "PROJECT_INTEREST",
  scope: "PROJECT",
  project_id: "p1",
  producer_id: "prod",
  buyer_id: "b1",
  buyer_name: "B",
  quantity: 2,
  desired_delivery_date: "2026-12-01",
  notes: "",
  status: "QUOTED",
  created_at: "2026-10-17T00:00:00.000Z",
  quotes: [quote(1, "BUYER")],
  history: [],
  ...overrides,
});
const today = "2026-10-17";

describe("transitions and turn", () => {
  it("tables the request lifecycle", () => {
    expect(nextStatus(REQUEST_TRANSITIONS, "QUOTED", "counter")).toBe("NEGOTIATING");
    expect(nextStatus(REQUEST_TRANSITIONS, "ACCEPTED", "withdraw")).toBeNull();
    expect(nextStatus(REQUEST_TRANSITIONS, "UNKNOWN", "accept")).toBeNull();
  });

  it("gives the move to the non-author of the latest SENT offer", () => {
    const r = toQuoteRequest(negotiation());
    expect(whoseTurn(r, today)).toBe("PRODUCER");
    expect(canAct(r, "BUYER", "accept", today)).toBe(false);
    expect(canAct(r, "PRODUCER", "accept", today)).toBe(true);
    expect(canAct(r, "BUYER", "withdraw", today)).toBe(true);
    expect(canAct(r, "BUYER", "cancel", today)).toBe(false);
  });

  it("expires lazily once valid_until is before today; milestone offers never expire", () => {
    const r = toQuoteRequest(negotiation());
    expect(effectiveRequestStatus(r, "2026-10-30")).toBe("QUOTED");
    expect(effectiveRequestStatus(r, "2026-10-31")).toBe("EXPIRED");
    const m = toQuoteRequest(negotiation({ scope: "MILESTONE", quotes: [quote(1, "BUYER", { valid_until: undefined })] }));
    expect(effectiveQuoteStatus(m.quotes[0], "2030-01-01")).toBe("SENT");
  });

  it("formats today as the local yyyy-mm-dd", () => {
    expect(isoToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("project negotiation guards", () => {
  const base = { project: { currentStatus: "DRAFT" as const }, milestone: null, negotiationLocked: false, agreedMilestoneIds: [], ownerId: "prod", starterId: "b1", hasLive: false };

  it("canStart: own project, project status, project agreed, milestone status/agreed, duplicate — in that order", () => {
    expect(canStart(base)).toBeNull();
    expect(canStart({ ...base, starterId: "prod", hasLive: true })).toBe("own_project");
    expect(canStart({ ...base, project: { currentStatus: "FUNDED_IN_CUSTODY" }, negotiationLocked: true })).toBe("project_status");
    expect(canStart({ ...base, negotiationLocked: true })).toBe("project_agreed");
    expect(canStart({ ...base, milestone: { id: "m1", status: "COMPLETED_AND_PAID" } })).toBe("milestone_status");
    expect(canStart({ ...base, milestone: { id: "m1", status: "LOCKED" }, agreedMilestoneIds: ["m1"] })).toBe("milestone_agreed");
    expect(canStart({ ...base, hasLive: true })).toBe("duplicate");
  });

  it("canAgree re-checks project and milestone at accept time", () => {
    expect(canAgree({ ...base, scope: "PROJECT" })).toBeNull();
    expect(canAgree({ ...base, scope: "MILESTONE", milestone: { id: "m1", status: "ACTIVE" }, agreedMilestoneIds: ["m1"] })).toBe("milestone_agreed");
    expect(canAgree({ ...base, scope: "PROJECT", project: { currentStatus: "CANCELLED_OR_DISPUTED" } })).toBe("project_status");
  });

  it("canDeposit: scope, agreement, owner, already deposited, total, project status", () => {
    const agreed = (deposit_status: string, agreed_total = 10) => toQuoteRequest(negotiation({ status: "ACCEPTED", deposit_status, agreed_total }));
    const open = { currentStatus: "DRAFT" as const };
    expect(canDeposit(toQuoteRequest(negotiation({ scope: "MILESTONE" })), "BUYER", "b1", open)).toBe("not_project");
    expect(canDeposit(toQuoteRequest(negotiation()), "BUYER", "b1", open)).toBe("not_agreed");
    expect(canDeposit(agreed("PENDING"), "BUYER", "b2", open)).toBe("not_owner");
    expect(canDeposit(agreed("DEPOSITED"), "BUYER", "b1", open)).toBe("already_deposited");
    expect(canDeposit(agreed("PENDING", 0), "BUYER", "b1", open)).toBe("no_total");
    expect(canDeposit(agreed("PENDING"), "BUYER", "b1", { currentStatus: "CANCELLED_OR_DISPUTED" })).toBe("project_status");
    expect(canDeposit(agreed("PENDING"), "BUYER", "b1", open)).toBeNull();
  });

  it("a counter must change quantity, unit, price or date (validity and notes do not count)", () => {
    const terms = { kind: "PROJECT" as const, quantity: 1, unit: "TON" as const, rawUnit: "TON", unitPrice: 5, deliveryDate: "2026-12-01", validUntil: "2026-10-30", notes: "" };
    expect(counterChangesATerm(terms, { ...terms, validUntil: "2026-11-30", notes: "x" })).toBe(false);
    expect(counterChangesATerm(terms, { ...terms, unitPrice: 6 })).toBe(true);
  });
});

describe("agreement effects", () => {
  it("projectQuotationTotal: agreed milestone prices replace budgets", () => {
    const milestones = [
      { id: "m1", suppliesBudget: 100, laborBudget: 50 },
      { id: "m2", suppliesBudget: 0, laborBudget: 30 },
    ];
    expect(projectQuotationTotal(milestones, new Map())).toBe(180);
    expect(projectQuotationTotal(milestones, new Map([["m1", 120]]))).toBe(150);
  });

  it("a PROJECT agreement closes every live project negotiation; a MILESTONE one only rivals on that milestone", () => {
    const all = [
      negotiation({ id: "a" }),
      negotiation({ id: "b", buyer_id: "b2", scope: "MILESTONE", milestone_id: "m1" }),
      negotiation({ id: "c", buyer_id: "b3", scope: "MILESTONE", milestone_id: "m2" }),
      negotiation({ id: "d", origin: "OPEN_REQUEST", scope: null }),
      negotiation({ id: "e", status: "REJECTED" }),
    ].map(toQuoteRequest);
    expect(autoCloseOthers(all, all[0], today)).toEqual(["b", "c"]);
    expect(autoCloseOthers(all, toQuoteRequest(negotiation({ id: "x", scope: "MILESTONE", milestone_id: "m1" })), today)).toEqual(["b"]);
  });

  it("catalogLocks derives the locks from agreed project negotiations", () => {
    const all = [negotiation({ id: "m", status: "ACCEPTED", scope: "MILESTONE", milestone_id: "m1" })].map(toQuoteRequest);
    expect(catalogLocks(all, "p1")).toEqual({ negotiationLocked: false, agreedMilestoneIds: ["m1"] });
  });

  it("allocationGuard caps an open-request award at what is left", () => {
    expect(remainingToAward({ quantity: 10, awardedQuantity: 7 })).toBe(3);
    expect(allocationGuard({ quantity: 10, awardedQuantity: 7 }, 4)).toEqual({ ok: false, remaining: 3 });
    expect(allocationGuard({ quantity: 10, awardedQuantity: 7 }, 3)).toEqual({ ok: true });
  });
});
