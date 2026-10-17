// Contract: the zod DTO schemas on origin/feat/producer-milestones (frontend/packages/shared/src/modules/{projects,milestones}/infrastructure/dto.ts).
// The web app rejects any other key set, so these assert exact keys, types and enums.
import { addSupplierLine, applyLineResult, fund, review } from "../../milestones/application/milestone";
import { addEvidenceLog } from "../../milestones/application/milestone-progress";
import { buildProject, type Project } from "../application/project";
import { viewsOf } from "../application/project-queries";
import { toEvidenceLogResponse, toMilestoneDetailResponse, toMilestoneSummaryResponse, toProjectResponse } from "./api.mappers";

const now = new Date("2026-10-16T12:00:00.000Z");
const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
const built = buildProject({
  id: "p1",
  ownerUserId: "u1",
  now,
  wallets,
  input: {
    title: "Café Castillo",
    description: "Establecimiento de plantas",
    productionType: "CAFE_ESPECIAL",
    startDate: "2026-11-01",
    estimatedEndDate: "2027-03-30",
    milestones: [
      {
        title: "Preparación",
        description: "Limpieza",
        estimatedCompletionDate: "2026-12-01",
        suppliesBudget: 3_200_000,
        laborBudget: 1_800_000,
        requirements: [
          { fieldKey: "soil_ph", label: "pH", type: "number", min: 4.5, max: 7 },
          { fieldKey: "level", label: "Nivel", type: "number" },
          { fieldKey: "ok", label: "Listo", type: "boolean_system_check" },
          { fieldKey: "photos", label: "Fotos", type: "photo_array", minItems: 1 },
        ],
      },
    ],
  },
});
const project: Project = { ...built.project, projectCode: "AGR-2026-001" };

const PROJECT_KEYS = [
  "id",
  "project_code",
  "title",
  "production_type",
  "description",
  "target_amount",
  "custody_balance",
  "total_disbursed",
  "investor_roi_pct",
  "platform_fee_pct",
  "current_status",
  "start_date",
  "estimated_end_date",
  "currency",
];
const SUMMARY_KEYS = ["id", "project_id", "sequence_order", "title", "status", "supplies_budget", "labor_budget", "supplies_executed", "labor_executed", "currency"];
const DETAIL_KEYS = [...SUMMARY_KEYS, "description", "estimated_completion_date", "required_evidences", "evidence_logs", "reviews"];
const keys = (o: object) => Object.keys(o).sort();

describe("toProjectResponse", () => {
  it("emits exactly the ProjectDto keys, amounts in whole pesos", () => {
    const dto = toProjectResponse(project);
    expect(keys(dto)).toEqual([...PROJECT_KEYS].sort());
    expect(dto).toEqual({
      id: "p1",
      project_code: "AGR-2026-001",
      title: "Café Castillo",
      production_type: "CAFE_ESPECIAL",
      description: "Establecimiento de plantas",
      target_amount: 5_000_000,
      custody_balance: 0,
      total_disbursed: 0,
      investor_roi_pct: 0,
      platform_fee_pct: 3,
      current_status: "DRAFT",
      start_date: "2026-11-01",
      estimated_end_date: "2027-03-30",
      currency: "COP",
    });
  });
});

describe("milestone responses", () => {
  const [view] = viewsOf(built.milestones);

  it("summary: exact keys, budgets from the lines in whole pesos (the platform fee is not a budget)", () => {
    const dto = toMilestoneSummaryResponse(view);
    expect(keys(dto)).toEqual([...SUMMARY_KEYS].sort());
    expect(dto).toEqual({
      id: "p1-ms-1",
      project_id: "p1",
      sequence_order: 1,
      title: "Preparación",
      status: "ACTIVE",
      supplies_budget: 3_200_000,
      labor_budget: 1_800_000,
      supplies_executed: 0,
      labor_executed: 0,
      currency: "COP",
    });
  });

  // v3: supplier lines come from approved orders (addSupplierLine), not a placeholder created with the project.
  it("executed amounts count settled lines only; the supplies budget is the cap left after labor and fee", () => {
    let m = fund(built.milestones[0], now);
    m = addSupplierLine(m, { id: "p1-ms-1-order-1", beneficiary: "Almacén", walletAddress: "https://w.test/pedro", amount: 100_000_000 });
    m = applyLineResult(m, "p1-ms-1-order-1", { status: "completado", reference: "SIM-1" }, now);
    const dto = toMilestoneSummaryResponse({ milestone: m, status: "SUPPLIES_PAID" });
    expect(dto).toMatchObject({ supplies_budget: 3_200_000, supplies_executed: 1_000_000, labor_executed: 0, status: "SUPPLIES_PAID" });
  });

  it("detail: exact keys, snake_case requirements (min/max only when set), logs and PRD verdicts", () => {
    let m = addEvidenceLog(built.milestones[0], [], { logType: "SOIL_ANALYSIS", notes: "n", evidencePayload: { soil_ph: 5, level: 1, ok: true, photos: ["https://f.test/1.jpg"] } }, now);
    m = review({ ...m, status: "evidence_submitted" }, "observado", "Falta", now);
    const dto = toMilestoneDetailResponse({ milestone: m, status: "CHANGES_REQUESTED" });
    expect(keys(dto)).toEqual([...DETAIL_KEYS].sort());
    expect(dto).toMatchObject({ description: "Limpieza", estimated_completion_date: "2026-12-01", status: "CHANGES_REQUESTED" });
    expect(dto.required_evidences).toEqual([
      { field_key: "soil_ph", label: "pH", type: "number", min: 4.5, max: 7 },
      { field_key: "level", label: "Nivel", type: "number" },
      { field_key: "ok", label: "Listo", type: "boolean_system_check" },
      { field_key: "photos", label: "Fotos", type: "photo_array", min_items: 1 },
    ]);
    expect(dto.evidence_logs).toEqual([
      {
        id: "p1-ms-1-log-1",
        milestone_id: "p1-ms-1",
        log_type: "SOIL_ANALYSIS",
        notes: "n",
        evidence_payload: { soil_ph: 5, level: 1, ok: true, photos: ["https://f.test/1.jpg"] },
        created_at: "2026-10-16T12:00:00.000Z",
      },
    ]);
    expect(dto.reviews).toEqual([{ id: "p1-ms-1-rev-1", verdict: "CHANGES_REQUESTED", comment: "Falta", created_at: "2026-10-16T12:00:00.000Z" }]);
    expect(toEvidenceLogResponse(m.id, m.evidenceLogs[0])).toEqual(dto.evidence_logs[0]);
  });

  it("maps every verdict to the PRD enum", () => {
    let m = fund(built.milestones[0], now);
    m = review({ ...m, status: "evidence_submitted", reviews: [{ id: "r0", verdict: "submitted", comment: null, createdAt: now }] }, "approved", null, now);
    m = applyLineResult(m, "p1-ms-1-productor", { status: "completado", reference: "SIM-1" }, now);
    expect(toMilestoneDetailResponse({ milestone: m, status: "TECHNICALLY_APPROVED" }).reviews.map((r) => r.verdict)).toEqual([
      "SUBMITTED",
      "APPROVED_FAVORABLE",
      "PAYOUT_EXECUTED",
    ]);
  });

  it("omits estimated_completion_date (optional, not nullable) and uses empty project fields for a legacy milestone", () => {
    const legacy = { ...built.milestones[0], projectId: null, sequenceOrder: null, estimatedCompletionDate: null };
    const dto = toMilestoneDetailResponse({ milestone: legacy, status: "ACTIVE" });
    expect("estimated_completion_date" in dto).toBe(false);
    expect(dto).toMatchObject({ project_id: "", sequence_order: 0 });
  });
});
