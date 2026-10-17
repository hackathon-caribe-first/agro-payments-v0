import {
  applyLineResult,
  assertLinePayable,
  createMilestone,
  LINE_KIND,
  LINE_STATUS,
  MILESTONE_STATUS,
  review,
  submitEvidence,
  type LineInput,
  type Milestone,
} from "./milestone";
import { DomainError } from "../../../shared/domain-errors";

const now = new Date("2026-10-16T12:00:00Z");

const lines: LineInput[] = [
  { id: "l-prod", kind: LINE_KIND.PRODUCTOR, beneficiary: "Productor", walletAddress: "https://wallet.test/prod", amount: 600_000 },
  { id: "l-prov", kind: LINE_KIND.PROVEEDOR, beneficiary: "Proveedor", walletAddress: "https://wallet.test/prov", amount: 300_000 },
  { id: "l-fee", kind: LINE_KIND.PLATAFORMA, beneficiary: "Plataforma", walletAddress: "https://wallet.test/fee", amount: 100_000 },
];

const input = { id: "m1", title: "Siembra", amount: 1_000_000, lines };
const draft = () => createMilestone(input);
const submitted = () => submitEvidence(draft(), "Foto del lote sembrado", now);
const approved = () => review(submitted(), "approved", null, now);
const done = (m: Milestone, lineId: string, status: "completado" | "fallido" | "en_cola" = "completado") =>
  applyLineResult(m, lineId, { status, reference: "SIM-1" }, now);

describe("createMilestone", () => {
  it("starts as draft with COP/2 defaults, pending lines and no closing date", () => {
    const m = draft();
    expect(m).toMatchObject({ status: MILESTONE_STATUS.DRAFT, currency: "COP", assetScale: 2, closedAt: null });
    expect(m.lines).toHaveLength(3);
    expect(m.lines.every((l) => l.status === LINE_STATUS.PENDIENTE && l.reference === null && l.settledAt === null)).toBe(true);
  });

  it("accepts lines that sum to the total and rejects a mismatch", () => {
    expect(draft().lines.reduce((sum, l) => sum + l.amount, 0)).toBe(draft().amount);
    expect(() => createMilestone({ ...input, amount: 1_000_001 })).toThrow(DomainError);
  });

  it("rejects non-integer minor units", () => {
    const fractional = [{ ...lines[0], amount: 600_000.5 }, { ...lines[1], amount: 399_999.5 }];
    expect(() => createMilestone({ ...input, lines: fractional })).toThrow(DomainError);
    expect(() => createMilestone({ ...input, amount: 10.5, lines: [{ ...lines[0], amount: 10.5 }] })).toThrow(DomainError);
  });

  it("rejects zero, negative and unsafe amounts", () => {
    expect(() => createMilestone({ ...input, amount: 1_000_000, lines: [lines[0], { ...lines[1], amount: 0 }, { ...lines[2], amount: 400_000 }] })).toThrow(DomainError);
    expect(() => createMilestone({ ...input, amount: 0, lines: [{ ...lines[0], amount: 0 }] })).toThrow(DomainError);
    const unsafe = Number.MAX_SAFE_INTEGER + 2;
    expect(() => createMilestone({ ...input, amount: unsafe, lines: [{ ...lines[0], amount: unsafe }] })).toThrow(DomainError);
  });

  it("requires exactly one productor line", () => {
    const none = lines.filter((l) => l.kind !== LINE_KIND.PRODUCTOR).map((l, i) => (i === 0 ? { ...l, amount: 900_000 } : l));
    expect(() => createMilestone({ ...input, lines: none })).toThrow(DomainError);
    const two = [lines[0], { ...lines[0], id: "l-prod2", amount: 400_000 }];
    expect(() => createMilestone({ ...input, lines: two })).toThrow(DomainError);
  });

  it("allows at most one plataforma line", () => {
    const twoFees = [lines[0], { ...lines[1], amount: 200_000 }, lines[2], { ...lines[2], id: "l-fee2", amount: 100_000 }];
    expect(() => createMilestone({ ...input, lines: twoFees })).toThrow(DomainError);
    expect(createMilestone({ ...input, lines: [lines[0], { ...lines[1], amount: 400_000 }] }).lines).toHaveLength(2);
  });
});

describe("milestone lifecycle", () => {
  it("producer submits evidence for verification", () => {
    const m = submitted();
    expect(m.status).toBe(MILESTONE_STATUS.EVIDENCE_SUBMITTED);
    expect(m.evidence).toEqual({ description: "Foto del lote sembrado", submittedAt: now });
  });

  it("rejects empty evidence", () => {
    expect(() => submitEvidence(draft(), "   ", now)).toThrow(DomainError);
  });

  it("verifier approves submitted evidence", () => {
    expect(approved().status).toBe(MILESTONE_STATUS.APPROVED);
  });

  it("observation requires a reason", () => {
    expect(() => review(submitted(), "observado", null, now)).toThrow(DomainError);
    expect(() => review(submitted(), "observado", "  ", now)).toThrow(DomainError);
  });

  it("allows unlimited resubmission after observado", () => {
    let m = submitted();
    for (let i = 0; i < 4; i++) {
      m = review(m, "observado", `Corrige ${i}`, now);
      expect(m.status).toBe(MILESTONE_STATUS.OBSERVADO);
      expect(m.review).toMatchObject({ decision: "observado", reason: `Corrige ${i}` });
      m = submitEvidence(m, `Nueva foto ${i}`, now);
      expect(m.status).toBe(MILESTONE_STATUS.EVIDENCE_SUBMITTED);
    }
  });

  it("cannot submit evidence once approved, nor review without evidence", () => {
    expect(() => submitEvidence(approved(), "otra", now)).toThrow(DomainError);
    expect(() => review(draft(), "approved", null, now)).toThrow(DomainError);
  });
});

describe("line payments", () => {
  it("lets a supplier line be paid before approval, leaving the producer line pending", () => {
    expect(assertLinePayable(draft(), "l-prov").id).toBe("l-prov");
    const m = done(draft(), "l-prov");
    expect(m.lines.find((l) => l.id === "l-prov")).toMatchObject({ status: "completado", reference: "SIM-1", settledAt: now });
    expect(m.lines.find((l) => l.id === "l-prod")?.status).toBe(LINE_STATUS.PENDIENTE);
  });

  it("blocks the producer line until the milestone is approved", () => {
    expect(() => assertLinePayable(draft(), "l-prod")).toThrow(DomainError);
    expect(() => assertLinePayable(submitted(), "l-prod")).toThrow(DomainError);
    expect(assertLinePayable(approved(), "l-prod").kind).toBe(LINE_KIND.PRODUCTOR);
  });

  it("rejects unknown lines and lines that are not pending", () => {
    expect(() => assertLinePayable(draft(), "nope")).toThrow(DomainError);
    expect(() => assertLinePayable(done(draft(), "l-prov"), "l-prov")).toThrow(DomainError);
    expect(() => assertLinePayable(done(draft(), "l-prov", "en_cola"), "l-prov")).toThrow(DomainError);
  });

  it("keeps a queued line open and resolves it later", () => {
    const queued = done(draft(), "l-prov", "en_cola");
    expect(queued.lines.find((l) => l.id === "l-prov")).toMatchObject({ status: "en_cola", settledAt: null });
    const resolved = done(queued, "l-prov", "completado");
    expect(resolved.lines.find((l) => l.id === "l-prov")).toMatchObject({ status: "completado", settledAt: now });
  });

  it("does not touch lines that are already final", () => {
    expect(() => done(done(draft(), "l-prov", "fallido"), "l-prov")).toThrow(DomainError);
  });

  it("closes only when every line is final, a fallido counts as final", () => {
    let m = approved();
    m = done(m, "l-prod");
    m = done(m, "l-prov", "fallido");
    expect(m.closedAt).toBeNull();
    m = done(m, "l-fee");
    expect(m.closedAt).toEqual(now);
  });

  it("does not close while a line is queued", () => {
    let m = approved();
    m = done(m, "l-prod");
    m = done(m, "l-prov");
    m = done(m, "l-fee", "en_cola");
    expect(m.closedAt).toBeNull();
  });

  it("refuses payments on a closed milestone", () => {
    const closed = ["l-prod", "l-prov", "l-fee"].reduce((m, id) => done(m, id), approved());
    expect(closed.closedAt).toEqual(now);
    expect(() => assertLinePayable(closed, "l-fee")).toThrow(DomainError);
  });
});
