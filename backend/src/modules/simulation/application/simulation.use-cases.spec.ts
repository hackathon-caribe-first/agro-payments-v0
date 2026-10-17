import { NotFoundError, RejectedError } from "../../../shared/domain-errors";
import { PurchaseContracts } from "../../contracts/ports/purchase-contracts";
import { FakeRepository } from "../../milestones/application/testing";
import { CreateProjectUseCase } from "../../projects/application/create-project.use-case";
import { PROJECT_STATUS, type Viewer } from "../../projects/application/project";
import { FakeProjectRepository } from "../../projects/application/testing";
import { MOTOR_VERSION } from "./motor";
import { PRESETS } from "./presets";
import { SimulationUseCases } from "./simulation.use-cases";
import { FakeSimulationRunRepository } from "./testing";

const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
const owner: Viewer = { id: "u-prod", role: "seller" };
const otherProducer: Viewer = { id: "u-other", role: "seller" };
const admin: Viewer = { id: "u-admin", role: "admin" };
const fidu: Viewer = { id: "u-fidu", role: "fidu" };
const investor: Viewer = { id: "u-inv", role: "investor" };
const fast = { runs: 500 };

/** RF-04: the projects that have a purchase contract. */
class FakePurchaseContracts extends PurchaseContracts {
  readonly projects = new Set<string>();
  async exists(projectId: string) {
    return this.projects.has(projectId);
  }
}

async function setup() {
  const projects = new FakeProjectRepository(new FakeRepository(new Map()));
  const project = await new CreateProjectUseCase(projects, wallets).execute(owner, {
    title: "Tomate bajo invernadero",
    description: "Ciclo de 120 días",
    productionType: "OTRO",
    startDate: "2026-11-01",
    estimatedEndDate: "2027-03-01",
    milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 100, laborBudget: 200, requirements: [] }],
  });
  const runs = new FakeSimulationRunRepository();
  // Every project starts with its purchase contract, so the RF-07 tests below exercise the offer rule; RF-04 is tested on its own.
  const contracts = new FakePurchaseContracts();
  contracts.projects.add(project.id);
  return { projects, project, runs, contracts, useCases: new SimulationUseCases(projects, runs, contracts) };
}

describe("SimulationUseCases.run", () => {
  it("runs a preset for the owner and stores inputs, seed, motor version and the sheet", async () => {
    const { useCases, project, runs } = await setup();
    const run = await useCases.run(project.id, owner, { preset: "P2", overrides: fast });
    expect(run).toMatchObject({ projectId: project.id, preset: "P2", seed: PRESETS.P2.inputs.seed, motorVersion: MOTOR_VERSION, createdBy: owner.id });
    expect(run.inputs).toEqual({ ...PRESETS.P2.inputs, runs: 500 });
    expect(run.sheet.offer.publishable).toBe(true);
    expect(await runs.findLatest(project.id)).toEqual(run);
  });

  it("applies the overrides: contract price, offered return, size, runs and seed", async () => {
    const { useCases, project } = await setup();
    const run = await useCases.run(project.id, admin, {
      preset: "P1",
      overrides: { contractPricePerKg: 1_400, offeredReturnPct: 10, hectares: 10, costPerHectare: 7_000_000, expectedYieldKgPerHa: 8_500, runs: 300, seed: 9 },
    });
    expect(run.inputs).toMatchObject({ price: { kind: "fixed", perKg: 1_400 }, offeredReturnPct: 10, hectares: 10, costPerHectare: 7_000_000, expectedYieldKgPerHa: 8_500, runs: 300, seed: 9 });
    expect(run.seed).toBe(9);
  });

  it("answers 404 for another producer's project or an unknown one", async () => {
    const { useCases, project } = await setup();
    await expect(useCases.run(project.id, otherProducer, { preset: "P2", overrides: fast })).rejects.toBeInstanceOf(NotFoundError);
    await expect(useCases.run("nope", admin, { preset: "P2", overrides: fast })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SimulationUseCases.latest", () => {
  it("returns the newest run; investors and the fiduciaria read it too", async () => {
    const { useCases, project } = await setup();
    await useCases.run(project.id, owner, { preset: "P1", overrides: fast });
    const second = await useCases.run(project.id, fidu, { preset: "P2", overrides: fast });
    expect((await useCases.latest(project.id, investor)).id).toBe(second.id);
  });

  it("answers 404 when the project was never simulated", async () => {
    const { useCases, project } = await setup();
    await expect(useCases.latest(project.id, owner)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SimulationUseCases.publish (RF-07 offer rule gate)", () => {
  it("refuses with a form-level 409 when the project has no simulation", async () => {
    const { useCases, project, projects } = await setup();
    await expect(useCases.publish(project.id, owner)).rejects.toThrow(new RejectedError("Simula el proyecto antes de publicarlo: la ficha decide si se puede ofrecer."));
    expect((await projects.findById(project.id))?.currentStatus).toBe(PROJECT_STATUS.DRAFT);
  });

  it("refuses when the latest sheet is not publishable, naming the reasons and the minimum contract price", async () => {
    const { useCases, project, projects } = await setup();
    const run = await useCases.run(project.id, owner, { preset: "P1", overrides: fast });
    const error = await useCases.publish(project.id, owner).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RejectedError);
    const message = (error as Error).message;
    expect(message).toMatch(/^El proyecto no cumple la regla de oferta\. /);
    expect(message).toContain(run.sheet.offer.reasons[0].message);
    const minimum = (run.sheet.offer.minimumContractPricePerKg as number) / 100;
    expect(message).toContain(`Precio mínimo de contrato para publicar: $ ${minimum.toLocaleString("es-CO")} por kg.`);
    expect((await projects.findById(project.id))?.currentStatus).toBe(PROJECT_STATUS.DRAFT);
  });

  it("uses only the LATEST run: a publishable P2 after P1 opens the capture (FUNDING_IN_PROGRESS)", async () => {
    const { useCases, project } = await setup();
    await useCases.run(project.id, owner, { preset: "P1", overrides: fast });
    await useCases.run(project.id, owner, { preset: "P2", overrides: fast });
    const published = await useCases.publish(project.id, owner);
    expect(published.currentStatus).toBe(PROJECT_STATUS.FUNDING_IN_PROGRESS);
  });

  it("refuses a sheet made by another motor version (RNF-11)", async () => {
    const { useCases, project, runs } = await setup();
    const run = await useCases.run(project.id, owner, { preset: "P2", overrides: fast });
    await runs.save({ ...run, id: "old", motorVersion: "surco-motor@0.9.0", createdAt: new Date(run.createdAt.getTime() + 1) });
    await expect(useCases.publish(project.id, owner)).rejects.toThrow(/otra versión del motor/);
  });

  it("refuses without a purchase contract (RF-04: contract before publishing), before anything else", async () => {
    const { useCases, project, projects, contracts } = await setup();
    await useCases.run(project.id, owner, { preset: "P2", overrides: fast });
    contracts.projects.clear();
    await expect(useCases.publish(project.id, owner)).rejects.toThrow(new RejectedError("Registra el contrato de compra antes de publicar: el comprador se pacta antes de captar."));
    expect((await projects.findById(project.id))?.currentStatus).toBe(PROJECT_STATUS.DRAFT);
  });

  it("publishes a project whose RF-09 contract was already signed (CONTRACT_SIGNED)", async () => {
    const { useCases, project, projects } = await setup();
    await useCases.run(project.id, owner, { preset: "P2", overrides: fast });
    await projects.updateStatus(project.id, PROJECT_STATUS.CONTRACT_SIGNED);
    expect((await useCases.publish(project.id, owner)).currentStatus).toBe(PROJECT_STATUS.FUNDING_IN_PROGRESS);
  });

  it("refuses a project that is no longer a draft", async () => {
    const { useCases, project, projects } = await setup();
    await useCases.run(project.id, owner, { preset: "P2", overrides: fast });
    await projects.updateStatus(project.id, PROJECT_STATUS.IN_EXECUTION);
    await expect(useCases.publish(project.id, owner)).rejects.toThrow(new RejectedError("Solo se publica un proyecto en borrador."));
  });

  it("answers 404 for another producer's project", async () => {
    const { useCases, project } = await setup();
    await expect(useCases.publish(project.id, otherProducer)).rejects.toBeInstanceOf(NotFoundError);
  });
});
