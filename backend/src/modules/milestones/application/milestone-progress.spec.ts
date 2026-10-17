import { DomainError, ValidationError } from "../../../shared/domain-errors";
import { applyLineResult, createMilestone, fund, LINE_KIND, type Milestone, type EvidenceLog, type MilestoneInput, type Requirement, review, REVIEW_VERDICT, submitEvidence } from "./milestone";
import {
  addEvidenceLog,
  canRecordEvidence,
  canSubmitForReview,
  currentFieldData,
  type EvidenceLogInput,
  missingRequirements,
  PROGRESS_STATUS,
  progressStatus,
  submitForReview,
  validateEvidenceLog,
} from "./milestone-progress";

const now = new Date("2026-10-16T12:00:00Z");
const later = new Date("2026-10-17T12:00:00Z");

const requirements: Requirement[] = [
  { fieldKey: "soil_ph", label: "pH del suelo", type: "number", min: 4.5, max: 7 },
  { fieldKey: "terrain_cleared", label: "Terreno despejado", type: "boolean_system_check" },
  { fieldKey: "field_photos", label: "Fotos del lote", type: "photo_array", minItems: 2 },
];

const projectMilestone = (sequenceOrder: number, extra: Partial<MilestoneInput> = {}): Milestone =>
  createMilestone({
    id: `p1-ms-${sequenceOrder}`,
    title: `Hito ${sequenceOrder}`,
    amount: 1_030_000,
    projectId: "p1",
    sequenceOrder,
    description: "Preparación",
    estimatedCompletionDate: "2026-11-30",
    requirements: [],
    lines: [
      { id: `ms${sequenceOrder}-prov`, kind: LINE_KIND.PROVEEDOR, beneficiary: "Proveedor", walletAddress: "https://w.test/prov", amount: 600_000 },
      { id: `ms${sequenceOrder}-prod`, kind: LINE_KIND.PRODUCTOR, beneficiary: "Productor", walletAddress: "https://w.test/prod", amount: 400_000 },
      { id: `ms${sequenceOrder}-fee`, kind: LINE_KIND.PLATAFORMA, beneficiary: "Plataforma", walletAddress: "https://w.test/fee", amount: 30_000 },
    ],
    ...extra,
  });

const pay = (m: Milestone, lineId: string, status: "completado" | "en_cola" | "fallido" = "completado") =>
  applyLineResult(m, lineId, { status, reference: "SIM-1" }, now);
const approve = (m: Milestone) => review(submitEvidence(m, "ok", now), "approved", null, now);

const goodLog = (): EvidenceLogInput => ({
  logType: "SOIL_ANALYSIS",
  notes: "Muestra compuesta",
  evidencePayload: { soil_ph: 5.6, terrain_cleared: true, field_photos: ["https://f.test/1.jpg", "https://f.test/2.jpg"] },
});

describe("createMilestone project fields", () => {
  it("defaults the PRD fields so legacy demo milestones keep their shape", () => {
    const m = createMilestone({
      id: "legacy",
      title: "Siembra",
      amount: 100,
      lines: [{ id: "p", kind: LINE_KIND.PRODUCTOR, beneficiary: "P", walletAddress: "https://w.test/p", amount: 100 }],
    });
    expect(m).toMatchObject({ projectId: null, sequenceOrder: null, description: "", estimatedCompletionDate: null, requirements: [], evidenceLogs: [], reviews: [] });
  });

  it("keeps the project, sequence, description, date and requirements it was created with", () => {
    const m = projectMilestone(2, { requirements });
    expect(m).toMatchObject({ projectId: "p1", sequenceOrder: 2, description: "Preparación", estimatedCompletionDate: "2026-11-30", requirements });
  });
});

describe("review history", () => {
  it("records submitted, observado and approved verdicts in order", () => {
    let m = submitEvidence(projectMilestone(1), "Fotos", now);
    m = review(m, "observado", "Falta foto", now);
    m = review(submitEvidence(m, "Fotos nuevas", later), "approved", null, later);
    expect(m.reviews.map((r) => [r.verdict, r.comment])).toEqual([
      [REVIEW_VERDICT.SUBMITTED, null],
      [REVIEW_VERDICT.OBSERVADO, "Falta foto"],
      [REVIEW_VERDICT.SUBMITTED, null],
      [REVIEW_VERDICT.APPROVED, null],
    ]);
    expect(new Set(m.reviews.map((r) => r.id)).size).toBe(4);
  });

  it("records payout_executed once the producer line settles, not when it is only queued", () => {
    const approved = approve(fund(projectMilestone(1), now));
    const queued = pay(approved, "ms1-prod", "en_cola");
    expect(queued.reviews.map((r) => r.verdict)).not.toContain(REVIEW_VERDICT.PAYOUT_EXECUTED);
    const settled = applyLineResult(queued, "ms1-prod", { status: "completado", reference: "SIM-1" }, later);
    expect(settled.reviews.at(-1)).toMatchObject({ verdict: REVIEW_VERDICT.PAYOUT_EXECUTED, createdAt: later });
  });

  it("does not record a payout for supplier lines", () => {
    expect(pay(fund(projectMilestone(1), now), "ms1-prov").reviews).toEqual([]);
  });
});

describe("progressStatus", () => {
  const first = projectMilestone(1);
  const second = projectMilestone(2);

  it("is ACTIVE for the first milestone and LOCKED for the next until the previous is approved", () => {
    expect(progressStatus(first, [first, second])).toBe(PROGRESS_STATUS.ACTIVE);
    expect(progressStatus(second, [first, second])).toBe(PROGRESS_STATUS.LOCKED);
    expect(progressStatus(second, [approve(first), second])).toBe(PROGRESS_STATUS.ACTIVE);
  });

  it("never locks a milestone without a project (legacy demo)", () => {
    const legacy = { ...second, projectId: null, sequenceOrder: null };
    expect(progressStatus(legacy, [first, legacy])).toBe(PROGRESS_STATUS.ACTIVE);
  });

  it("ignores milestones of other projects", () => {
    const foreign = { ...first, id: "x", projectId: "p2" };
    expect(progressStatus(second, [foreign, second])).toBe(PROGRESS_STATUS.ACTIVE);
  });

  it("follows the supplier lines: SUPPLIES_ORDERED while queued, SUPPLIES_PAID once settled, IN_FIELD_EXECUTION with logs", () => {
    const funded = fund(first, now);
    expect(progressStatus(funded, [funded])).toBe(PROGRESS_STATUS.ACTIVE);
    const ordered = pay(funded, "ms1-prov", "en_cola");
    expect(progressStatus(ordered, [ordered])).toBe(PROGRESS_STATUS.SUPPLIES_ORDERED);
    const paid = pay(funded, "ms1-prov");
    expect(progressStatus(paid, [paid])).toBe(PROGRESS_STATUS.SUPPLIES_PAID);
    const logged = addEvidenceLog(paid, [paid], { logType: "AGRONOMIC_NOTE", notes: "", evidencePayload: {} }, now);
    expect(progressStatus(logged, [logged])).toBe(PROGRESS_STATUS.IN_FIELD_EXECUTION);
  });

  it("stays ACTIVE when the supplier line failed", () => {
    const failed = pay(fund(first, now), "ms1-prov", "fallido");
    expect(progressStatus(failed, [failed])).toBe(PROGRESS_STATUS.ACTIVE);
  });

  it("maps review states: submitted, observado, approved, labor payout queued, closed", () => {
    const submitted = submitEvidence(fund(first, now), "x", now);
    expect(progressStatus(submitted, [submitted])).toBe(PROGRESS_STATUS.SUBMITTED_FOR_REVIEW);
    const observed = review(submitted, "observado", "falta", now);
    expect(progressStatus(observed, [observed])).toBe(PROGRESS_STATUS.CHANGES_REQUESTED);
    const approved = review(submitted, "approved", null, now);
    expect(progressStatus(approved, [approved])).toBe(PROGRESS_STATUS.TECHNICALLY_APPROVED);
    const payout = pay(approved, "ms1-prod", "en_cola");
    expect(progressStatus(payout, [payout])).toBe(PROGRESS_STATUS.LABOR_PAYOUT_PENDING);
    const closed = pay(pay(pay(approved, "ms1-prod"), "ms1-prov"), "ms1-fee");
    expect(progressStatus(closed, [closed])).toBe(PROGRESS_STATUS.COMPLETED_AND_PAID);
  });

  it("accepts evidence and submission only in the PRD statuses", () => {
    expect(Object.values(PROGRESS_STATUS).filter(canRecordEvidence)).toEqual(["ACTIVE", "SUPPLIES_PAID", "IN_FIELD_EXECUTION", "CHANGES_REQUESTED"]);
    expect(Object.values(PROGRESS_STATUS).filter(canSubmitForReview)).toEqual(["ACTIVE", "IN_FIELD_EXECUTION", "CHANGES_REQUESTED"]);
  });
});

describe("validateEvidenceLog", () => {
  const errorsOf = (input: Parameters<typeof validateEvidenceLog>[1]) => {
    try {
      validateEvidenceLog(requirements, input);
      return {};
    } catch (error) {
      if (error instanceof ValidationError) return error.fieldErrors;
      throw error;
    }
  };

  it("accepts a payload that matches every requirement", () => {
    expect(validateEvidenceLog(requirements, goodLog())).toEqual(goodLog());
  });

  it("rejects unknown keys and missing required keys", () => {
    const { field_photos: _, ...rest } = goodLog().evidencePayload;
    expect(errorsOf({ ...goodLog(), evidencePayload: { ...rest, extra: 1 } })).toEqual({
      "evidencePayload.field_photos": ["Adjunta las fotos requeridas."],
      "evidencePayload.extra": ["Campo no permitido."],
    });
  });

  it("enforces number bounds, booleans, photo URLs and min items", () => {
    expect(
      errorsOf({ ...goodLog(), evidencePayload: { soil_ph: 8, terrain_cleared: "yes", field_photos: ["https://f.test/1.jpg", "javascript:alert(1)"] } }),
    ).toEqual({
      "evidencePayload.soil_ph": ["Debe ser como máximo 7."],
      "evidencePayload.terrain_cleared": ["Indica si la verificación se cumple."],
      "evidencePayload.field_photos.1": ["Cada foto debe ser una URL válida."],
    });
    expect(errorsOf({ ...goodLog(), evidencePayload: { ...goodLog().evidencePayload, soil_ph: 4, field_photos: ["https://f.test/1.jpg"] } })).toEqual({
      "evidencePayload.soil_ph": ["Debe ser como mínimo 4.5."],
      "evidencePayload.field_photos": ["Adjunta al menos 2 fotos."],
    });
  });

  it("rejects an unknown log type, long notes and a non-object payload", () => {
    expect(errorsOf({ logType: "SELFIE", notes: "x".repeat(1001), evidencePayload: [] })).toEqual({
      logType: ["Selecciona un tipo de registro válido."],
      notes: ["Máximo 1000 caracteres."],
      evidencePayload: ["La evidencia debe ser un objeto."],
    });
  });
});

describe("addEvidenceLog", () => {
  const active = () => projectMilestone(1, { requirements });

  it("appends a log with a milestone-scoped id", () => {
    const m = addEvidenceLog(active(), [active()], goodLog(), now);
    expect(m.evidenceLogs).toEqual([{ id: "p1-ms-1-log-1", ...goodLog(), createdAt: now }]);
    expect(addEvidenceLog(m, [m], goodLog(), later).evidenceLogs[1].id).toBe("p1-ms-1-log-2");
  });

  it("refuses logs (409) when the status does not accept them, before validating the payload", () => {
    const locked = projectMilestone(2, { requirements });
    expect(() => addEvidenceLog(locked, [active(), locked], { ...goodLog(), evidencePayload: {} }, now)).toThrow(DomainError);
    const submitted = submitEvidence(active(), "x", now);
    expect(() => addEvidenceLog(submitted, [submitted], goodLog(), now)).toThrow(DomainError);
  });

  it("rejects (400) a payload that does not match the requirements", () => {
    expect(() => addEvidenceLog(active(), [active()], { ...goodLog(), evidencePayload: { soil_ph: 5 } }, now)).toThrow(ValidationError);
  });
});

describe("currentFieldData / missingRequirements", () => {
  it("lets the latest value per field key win, by creation time", () => {
    const logs: EvidenceLog[] = [
      { id: "b", logType: "IOT_READING" as const, notes: "", evidencePayload: { soil_ph: 6 }, createdAt: later },
      { id: "a", logType: "IOT_READING" as const, notes: "", evidencePayload: { soil_ph: 9, terrain_cleared: true }, createdAt: now },
    ];
    expect(currentFieldData(logs)).toEqual({ soil_ph: 6, terrain_cleared: true });
  });

  it("lists requirements not satisfied by the current data (a false check is unmet)", () => {
    expect(missingRequirements(requirements, { soil_ph: 6, terrain_cleared: false, field_photos: ["https://f.test/1.jpg"] })).toEqual([
      "terrain_cleared",
      "field_photos",
    ]);
  });
});

describe("submitForReview", () => {
  it("moves an active milestone with met requirements to evidence_submitted and records SUBMITTED", () => {
    const logged = addEvidenceLog(projectMilestone(1, { requirements }), [], goodLog(), now);
    const m = submitForReview(logged, [logged], later);
    expect(progressStatus(m, [m])).toBe(PROGRESS_STATUS.SUBMITTED_FOR_REVIEW);
    expect(m.evidence?.submittedAt).toEqual(later);
    expect(m.reviews.at(-1)).toMatchObject({ verdict: REVIEW_VERDICT.SUBMITTED, comment: null, createdAt: later });
  });

  it("submits a milestone without requirements", () => {
    const m = projectMilestone(1);
    expect(submitForReview(m, [m], now).status).toBe("evidence_submitted");
  });

  it("refuses (409) when requirements are unmet", () => {
    const m = projectMilestone(1, { requirements });
    expect(() => submitForReview(m, [m], now)).toThrow(/soil_ph, terrain_cleared, field_photos/);
  });

  it("refuses (409) from LOCKED, SUPPLIES_PAID and SUBMITTED_FOR_REVIEW", () => {
    const first = projectMilestone(1);
    const second = projectMilestone(2);
    expect(() => submitForReview(second, [first, second], now)).toThrow(DomainError);
    const paid = pay(fund(first, now), "ms1-prov");
    expect(() => submitForReview(paid, [paid], now)).toThrow(DomainError);
    const submitted = submitForReview(first, [first], now);
    expect(() => submitForReview(submitted, [submitted], now)).toThrow(DomainError);
  });

  it("resubmits after CHANGES_REQUESTED", () => {
    const observed = review(submitForReview(projectMilestone(1), [], now), "observado", "falta", now);
    expect(submitForReview(observed, [observed], later).status).toBe("evidence_submitted");
  });
});

// Block 3: a buyer's custody deposit is what opens a project's milestones (PRD v3: FUNDED_IN_CUSTODY releases the first one).
describe("custody gate", () => {
  const first = projectMilestone(1, { requirements });
  const second = projectMilestone(2);
  const unfunded = { custodyFunded: false };
  const funded = { custodyFunded: true };

  it("locks every draft milestone while the project's custody is not funded, and keeps the order rule once it is", () => {
    expect(progressStatus(first, [first, second], unfunded)).toBe(PROGRESS_STATUS.LOCKED);
    expect(progressStatus(second, [first, second], unfunded)).toBe(PROGRESS_STATUS.LOCKED);
    expect(progressStatus(first, [first, second], funded)).toBe(PROGRESS_STATUS.ACTIVE);
    expect(progressStatus(second, [first, second], funded)).toBe(PROGRESS_STATUS.LOCKED);
  });

  it("does not hide progress already made: only draft milestones are gated", () => {
    const submitted = submitEvidence(first, "x", now);
    expect(progressStatus(submitted, [submitted], unfunded)).toBe(PROGRESS_STATUS.SUBMITTED_FOR_REVIEW);
  });

  it("refuses evidence and submission (409) until the custody is funded", () => {
    expect(() => addEvidenceLog(first, [first], goodLog(), now, unfunded)).toThrow(DomainError);
    const logged = addEvidenceLog(first, [first], goodLog(), now, funded);
    expect(() => submitForReview(logged, [logged], now, unfunded)).toThrow(DomainError);
    expect(submitForReview(logged, [logged], now, funded).status).toBe("evidence_submitted");
  });
});
