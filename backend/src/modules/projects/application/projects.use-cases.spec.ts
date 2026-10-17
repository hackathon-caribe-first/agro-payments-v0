import { DomainError, NotFoundError, ValidationError } from "../../../shared/domain-errors";
import { createMilestone, LINE_KIND, type Milestone } from "../../milestones/application/milestone";
import { PROGRESS_STATUS } from "../../milestones/application/milestone-progress";
import { FakeRepository } from "../../milestones/application/testing";
import { CreateProjectUseCase } from "./create-project.use-case";
import { MilestoneEvidenceUseCase } from "./milestone-evidence.use-case";
import type { NewProjectInput, Viewer } from "./project";
import { ProjectQueries } from "./project-queries";
import { FakeProjectRepository } from "./testing";

const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
const producer: Viewer = { id: "u1", role: "seller" };
const otherProducer: Viewer = { id: "u2", role: "seller" };
const verifier: Viewer = { id: "v1", role: "fidu" };
const admin: Viewer = { id: "a1", role: "admin" };

const input = (): NewProjectInput => ({
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
      suppliesBudget: 100,
      laborBudget: 200,
      requirements: [{ fieldKey: "ok", label: "Listo", type: "boolean_system_check" }],
    },
    { title: "Siembra", description: "Siembra", estimatedCompletionDate: "2027-01-15", suppliesBudget: 0, laborBudget: 300, requirements: [] },
  ],
});

const legacy = (): Milestone =>
  createMilestone({ id: "legacy", title: "Siembra", amount: 100, lines: [{ id: "p", kind: LINE_KIND.PRODUCTOR, beneficiary: "P", walletAddress: "https://w.test/p", amount: 100 }] });

function setup(...seed: Milestone[]) {
  const milestones = new FakeRepository(new Map(seed.map((m) => [m.id, m])));
  const projects = new FakeProjectRepository(milestones);
  const queries = new ProjectQueries(projects, milestones);
  const create = new CreateProjectUseCase(projects, wallets);
  // Block 3: milestones open only once a buyer's deposit funds the custody, so the evidence flow starts from a funded project.
  const createFunded = async (viewer: Viewer) => {
    const project = await create.execute(viewer, input());
    (await projects.findById(project.id))!.currentStatus = "FUNDED_IN_CUSTODY";
    return project;
  };
  return { milestones, projects, queries, create, createFunded, evidence: new MilestoneEvidenceUseCase(queries, milestones) };
}

describe("CreateProjectUseCase", () => {
  it("creates a DRAFT project owned by the caller, with a code and its milestones stored", async () => {
    const { create, milestones } = setup();
    const project = await create.execute(producer, input());
    expect(project).toMatchObject({ ownerUserId: "u1", projectCode: `AGR-${new Date().getUTCFullYear()}-001`, currentStatus: "DRAFT", targetAmount: 60_000 });
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await milestones.findByProject(project.id)).map((m) => m.sequenceOrder)).toEqual([1, 2]);
  });

  it("rejects invalid input with field errors and stores nothing", async () => {
    const { create, projects } = setup();
    await expect(create.execute(producer, { ...input(), title: "x" })).rejects.toThrow(ValidationError);
    expect(await projects.findByOwner("u1")).toEqual([]);
  });
});

describe("ProjectQueries", () => {
  it("lists only the caller's projects", async () => {
    const { create, queries } = setup();
    const mine = await create.execute(producer, input());
    await create.execute(otherProducer, input());
    expect((await queries.listOwned(producer)).map((p) => p.id)).toEqual([mine.id]);
  });

  it("hides another producer's project as not found, and shows it to fidu and admin", async () => {
    const { create, queries } = setup();
    const project = await create.execute(producer, input());
    await expect(queries.get(project.id, otherProducer)).rejects.toThrow(NotFoundError);
    await expect(queries.get("nope", producer)).rejects.toThrow(NotFoundError);
    expect((await queries.get(project.id, verifier)).id).toBe(project.id);
    expect((await queries.get(project.id, admin)).id).toBe(project.id);
  });

  it("lists a project's milestones in order with their derived status", async () => {
    const { createFunded, queries } = setup();
    const project = await createFunded(producer);
    const views = await queries.milestones(project.id, producer);
    expect(views.map((v) => [v.milestone.sequenceOrder, v.status])).toEqual([
      [1, PROGRESS_STATUS.ACTIVE],
      [2, PROGRESS_STATUS.LOCKED],
    ]);
    await expect(queries.milestones(project.id, otherProducer)).rejects.toThrow(NotFoundError);
  });

  it("reads one milestone with its status, scoped like its project; legacy milestones are readable by every reader", async () => {
    const { create, queries } = setup(legacy());
    const project = await create.execute(producer, input());
    expect((await queries.milestone(`${project.id}-ms-2`, producer)).status).toBe(PROGRESS_STATUS.LOCKED);
    await expect(queries.milestone(`${project.id}-ms-1`, otherProducer)).rejects.toThrow(NotFoundError);
    await expect(queries.milestone("nope", producer)).rejects.toThrow(NotFoundError);
    expect((await queries.milestone("legacy", otherProducer)).status).toBe(PROGRESS_STATUS.ACTIVE);
  });

  it("keeps every milestone LOCKED until the project is FUNDED_IN_CUSTODY", async () => {
    const { create, queries, evidence } = setup();
    const project = await create.execute(producer, input());
    expect((await queries.milestones(project.id, producer)).map((v) => v.status)).toEqual([PROGRESS_STATUS.LOCKED, PROGRESS_STATUS.LOCKED]);
    expect((await queries.milestone(`${project.id}-ms-1`, producer)).status).toBe(PROGRESS_STATUS.LOCKED);
    await expect(evidence.addLog(`${project.id}-ms-1`, producer, { logType: "IOT_READING", notes: "", evidencePayload: { ok: true } })).rejects.toThrow(DomainError);
  });
});

describe("MilestoneEvidenceUseCase", () => {
  const log = { logType: "IOT_READING", notes: "lectura", evidencePayload: { ok: true } };

  it("records a log and persists it", async () => {
    const { createFunded, evidence, milestones } = setup();
    const project = await createFunded(producer);
    const recorded = await evidence.addLog(`${project.id}-ms-1`, producer, log);
    expect(recorded).toMatchObject({ id: `${project.id}-ms-1-log-1`, logType: "IOT_READING", evidencePayload: { ok: true } });
    expect((await milestones.findById(`${project.id}-ms-1`))?.evidenceLogs).toHaveLength(1);
  });

  it("refuses a locked milestone (409), a bad payload (400) and another producer (404)", async () => {
    const { createFunded, evidence } = setup();
    const project = await createFunded(producer);
    await expect(evidence.addLog(`${project.id}-ms-2`, producer, { ...log, evidencePayload: {} })).rejects.toThrow(DomainError);
    await expect(evidence.addLog(`${project.id}-ms-1`, producer, { ...log, evidencePayload: { ok: "yes" } })).rejects.toThrow(ValidationError);
    await expect(evidence.addLog(`${project.id}-ms-1`, otherProducer, log)).rejects.toThrow(NotFoundError);
  });

  it("submits once the requirements are met and returns the new view", async () => {
    const { createFunded, evidence } = setup();
    const project = await createFunded(producer);
    const id = `${project.id}-ms-1`;
    await expect(evidence.submit(id, producer)).rejects.toThrow(/unmet requirements: ok/);
    await evidence.addLog(id, producer, log);
    const view = await evidence.submit(id, admin);
    expect(view.status).toBe(PROGRESS_STATUS.SUBMITTED_FOR_REVIEW);
    expect(view.milestone.reviews.at(-1)?.verdict).toBe("submitted");
  });
});
