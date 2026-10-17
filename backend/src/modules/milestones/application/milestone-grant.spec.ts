import { DomainError } from "../../../shared/domain-errors";
import { applyLineResult, createMilestone, fund, LINE_KIND, type Milestone, review, submitEvidence } from "./milestone";
import { assertGrantCanStart, GRANT_STATE, grantState } from "./milestone-grant";

const now = new Date("2026-10-16T12:00:00Z");
const ms = (order: number, projectId: string | null = "p1"): Milestone =>
  createMilestone({
    id: `${projectId ?? "legacy"}-ms-${order}`,
    title: `Hito ${order}`,
    amount: 100_000,
    projectId,
    sequenceOrder: projectId ? order : null,
    lines: [{ id: "fee", kind: LINE_KIND.PLATAFORMA, beneficiary: "Plataforma", walletAddress: "https://w.test/fee", amount: 3_000 }],
  });
const approvedAndClosed = (m: Milestone) =>
  applyLineResult(review(submitEvidence(fund(m, now), "Foto", now), "approved", null, now), "fee", { status: "completado", reference: "R" }, now);

describe("grantState", () => {
  it("derives none → active → revoked from funding and closing", () => {
    expect(grantState(ms(1))).toBe(GRANT_STATE.NONE);
    expect(grantState(fund(ms(1), now))).toBe(GRANT_STATE.ACTIVE);
    expect(grantState(approvedAndClosed(ms(1)))).toBe(GRANT_STATE.REVOKED);
  });
});

describe("assertGrantCanStart (RF-13: one live grant per project, N+1 after N is approved and revoked)", () => {
  it("lets the first milestone of a project start its grant", () => {
    expect(() => assertGrantCanStart(ms(1), [ms(1), ms(2)])).not.toThrow();
  });

  it("refuses a milestone already funded or closed", () => {
    expect(() => assertGrantCanStart(fund(ms(1), now), [])).toThrow(/already funded/);
  });

  it("refuses N+1 while milestone N is not approved and closed", () => {
    const first = fund(ms(1), now);
    expect(() => assertGrantCanStart(ms(2), [first, ms(2)])).toThrow(DomainError);
    const observed = review(submitEvidence(first, "Foto", now), "observado", "Falta", now);
    expect(() => assertGrantCanStart(ms(2), [observed, ms(2)])).toThrow(/Hito 1|p1-ms-1/);
  });

  it("allows N+1 once N closed (grant revoked)", () => {
    expect(() => assertGrantCanStart(ms(2), [approvedAndClosed(ms(1)), ms(2)])).not.toThrow();
  });

  it("refuses a second live grant in the same project, whatever the order", () => {
    const live = fund(ms(3), now);
    expect(() => assertGrantCanStart(ms(1), [ms(1), live])).toThrow(/live grant/);
  });

  it("ignores other projects and never gates legacy milestones without a project", () => {
    expect(() => assertGrantCanStart(ms(2), [fund(ms(1, "p2"), now), ms(2)])).not.toThrow();
    expect(() => assertGrantCanStart(ms(1, null), [fund(ms(2, null), now)])).not.toThrow();
  });
});
