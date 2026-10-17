import { NotFoundError, ValidationError } from "../../../shared/domain-errors";
import { FakeRepository } from "../../milestones/application/testing";
import { CreateProjectUseCase } from "../../projects/application/create-project.use-case";
import { FakeProjectRepository } from "../../projects/application/testing";
import { AdmissionRepository } from "../ports/admission.repository";
import { ADMISSION_BLOCKS, type ProjectAdmission, admissionOutcome, AdmissionUseCases } from "./admission";
import { ELIMINATION_FILTERS } from "./motor";

class MemoryAdmissions extends AdmissionRepository {
  readonly rows: ProjectAdmission[] = [];
  async save(a: ProjectAdmission) {
    this.rows.push(a);
  }
  async findLatest(projectId: string) {
    return this.rows.filter((a) => a.projectId === projectId).at(-1) ?? null;
  }
}

const passing = () => ELIMINATION_FILTERS.map(() => ({ passes: true, evidence: "Consulta SARLAFT sin hallazgos" }));
const blocks = (x: number) => Object.fromEntries(ADMISSION_BLOCKS.map((b) => [b, x])) as Record<(typeof ADMISSION_BLOCKS)[number], number>;

describe("admissionOutcome (RF-02/RF-03 via the motor's A15)", () => {
  it("maps level B to 3 milestones, 70–80 % financeable and a jornales line", () => {
    expect(admissionOutcome({ filters: passing(), blocks: blocks(65) })).toEqual({
      admitted: true,
      failedFilters: [],
      score: 65,
      level: "B",
      milestones: 3,
      milestoneRange: { min: 3, max: 4 },
      financeablePct: { min: 70, max: 80 },
      laborLine: true,
    });
  });

  it("level A finances up to 100 % in 2 milestones; C up to 50 % without jornales; primer ciclo pays in kind", () => {
    expect(admissionOutcome({ filters: passing(), blocks: blocks(80) })).toMatchObject({ level: "A", milestones: 2, financeablePct: { min: null, max: 100 }, laborLine: true });
    expect(admissionOutcome({ filters: passing(), blocks: blocks(55) })).toMatchObject({ level: "C", milestones: 3, financeablePct: { min: null, max: 50 }, laborLine: false });
    expect(admissionOutcome({ filters: passing(), blocks: blocks(40) })).toMatchObject({ level: "primer_ciclo", milestones: null, financeablePct: null, laborLine: false });
  });

  it("is binary on the nine filters: one failure is a rejection with score 0, whatever the blocks", () => {
    const filters = passing();
    filters[2] = { passes: false, evidence: "Lote dentro del páramo de Sumapaz" };
    expect(admissionOutcome({ filters, blocks: blocks(90) })).toMatchObject({ admitted: false, failedFilters: ["Lote en páramo o área protegida"], score: 0 });
  });
});

describe("AdmissionUseCases", () => {
  const setup = async () => {
    const projects = new FakeProjectRepository(new FakeRepository(new Map()));
    const project = await new CreateProjectUseCase(projects, { producer: "https://w", supplier: "https://w", platform: "https://w" }).execute({ id: "u-prod", role: "seller" }, {
      title: "Maíz P1",
      description: "Maíz en dos hectáreas",
      productionType: "OTRO",
      startDate: "2026-11-01",
      estimatedEndDate: "2027-03-30",
      milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 1, laborBudget: 1, requirements: [] }],
    });
    const admissions = new MemoryAdmissions();
    return { project, admissions, useCases: new AdmissionUseCases(projects, admissions) };
  };

  it("stores the filters with their evidence and the outcome, and reads back the latest", async () => {
    const { project, useCases, admissions } = await setup();
    const saved = await useCases.assess(project.id, { id: "v-1", role: "verifier" }, { filters: passing(), blocks: blocks(65) });
    expect(saved).toMatchObject({
      projectId: project.id,
      createdBy: "v-1",
      motorVersion: "surco-motor@1.0.0",
      filters: ELIMINATION_FILTERS.map((name) => ({ name, passes: true, evidence: "Consulta SARLAFT sin hallazgos" })),
      outcome: { level: "B", milestones: 3 },
    });
    expect(admissions.rows).toHaveLength(1);
    expect(await useCases.latest(project.id, { id: "u-prod", role: "seller" })).toEqual(saved);
  });

  it("hides another producer's project and answers 404 before any assessment", async () => {
    const { project, useCases } = await setup();
    await expect(useCases.assess(project.id, { id: "u-other", role: "seller" }, { filters: passing(), blocks: blocks(65) })).rejects.toThrow(NotFoundError);
    await expect(useCases.latest(project.id, { id: "u-prod", role: "seller" })).rejects.toThrow(NotFoundError);
  });

  it("refuses a filter without evidence", async () => {
    const { project, useCases } = await setup();
    const filters = passing();
    filters[0] = { passes: true, evidence: " " };
    await expect(useCases.assess(project.id, { id: "u-prod", role: "seller" }, { filters, blocks: blocks(65) })).rejects.toThrow(ValidationError);
  });
});
