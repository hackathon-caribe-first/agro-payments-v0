import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { NotFoundError, RejectedError } from "../../../shared/domain-errors";
import { PurchaseContracts } from "../../contracts/ports/purchase-contracts";
import { canView, PROJECT_STATUS, type Project, type ProjectStatus, type Viewer } from "../../projects/application/project";
import { ProjectRepository } from "../../projects/ports/project.repository";
import { SimulationRunRepository } from "../ports/simulation-run.repository";
import { MOTOR_VERSION, PRICE_KIND, type SimulationInputs, simulate } from "./motor";
import { type PresetId, PRESETS } from "./presets";
import type { SimulationRun } from "./simulation-run";

/** What the API may change on top of a preset. */
export interface SimulationOverrides {
  contractPricePerKg?: number;
  offeredReturnPct?: number;
  hectares?: number;
  costPerHectare?: number;
  expectedYieldKgPerHa?: number;
  runs?: number;
  seed?: number;
}

export interface SimulationRequest {
  preset: PresetId;
  overrides: SimulationOverrides;
}

// ponytail: a run starts from a PRD preset plus a few overrides; the project's own crop parameters (RF-01 registration,
// RF-04 contract, RF-05 policy) are not captured yet, so the sheet is not derived from the project's milestones.
function inputsFor({ preset, overrides: o }: SimulationRequest): SimulationInputs {
  const base = structuredClone(PRESETS[preset].inputs);
  const price = o.contractPricePerKg !== undefined && base.price.kind === PRICE_KIND.FIXED ? { ...base.price, perKg: o.contractPricePerKg } : base.price;
  return {
    ...base,
    price,
    offeredReturnPct: o.offeredReturnPct ?? base.offeredReturnPct,
    hectares: o.hectares ?? base.hectares,
    costPerHectare: o.costPerHectare ?? base.costPerHectare,
    expectedYieldKgPerHa: o.expectedYieldKgPerHa ?? base.expectedYieldKgPerHa,
    runs: o.runs ?? base.runs,
    seed: o.seed ?? base.seed,
  };
}

/** DRAFT, or CONTRACT_SIGNED when every party signed the RF-09 contract before the capture opened. */
const PUBLISHABLE: readonly ProjectStatus[] = [PROJECT_STATUS.DRAFT, PROJECT_STATUS.CONTRACT_SIGNED];

const pesosPerKg = (minor: number) => (minor / 100).toLocaleString("es-CO");

@Injectable()
export class SimulationUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly runs: SimulationRunRepository,
    private readonly contracts: PurchaseContracts,
  ) {}

  private async project(id: string, viewer: Viewer): Promise<Project> {
    const project = await this.projects.findById(id);
    if (!project || !canView(project, viewer)) throw new NotFoundError(`Project ${id} not found`);
    return project;
  }

  presets() {
    return Object.values(PRESETS);
  }

  /** RF-06: runs the motor and stores the run; the newest run is the project's sheet. */
  async run(projectId: string, viewer: Viewer, request: SimulationRequest): Promise<SimulationRun> {
    const project = await this.project(projectId, viewer);
    const inputs = inputsFor(request);
    const sheet = simulate(inputs);
    const run: SimulationRun = {
      id: randomUUID(),
      projectId: project.id,
      preset: request.preset,
      inputs,
      seed: inputs.seed,
      motorVersion: sheet.motorVersion,
      sheet,
      createdBy: viewer.id,
      createdAt: new Date(),
    };
    await this.runs.save(run);
    return run;
  }

  async latest(projectId: string, viewer: Viewer): Promise<SimulationRun> {
    const project = await this.project(projectId, viewer);
    const run = await this.runs.findLatest(project.id);
    if (!run) throw new NotFoundError(`Project ${projectId} has no simulation`);
    return run;
  }

  /**
   * RF-07: a DRAFT (or CONTRACT_SIGNED) project opens its capture (FUNDING_IN_PROGRESS) only when it has its RF-04 purchase
   * contract and its latest sheet, made by this motor version, passes the offer rule. Every refusal is a form-level 409 the
   * producer can act on.
   */
  async publish(projectId: string, viewer: Viewer): Promise<Project> {
    const project = await this.project(projectId, viewer);
    if (!PUBLISHABLE.includes(project.currentStatus)) throw new RejectedError("Solo se publica un proyecto en borrador.");
    if (!(await this.contracts.exists(project.id))) throw new RejectedError("Registra el contrato de compra antes de publicar: el comprador se pacta antes de captar.");
    const run = await this.runs.findLatest(project.id);
    if (!run) throw new RejectedError("Simula el proyecto antes de publicarlo: la ficha decide si se puede ofrecer.");
    if (run.motorVersion !== MOTOR_VERSION) throw new RejectedError("La ficha se generó con otra versión del motor. Vuelve a simular el proyecto.");
    const { offer } = run.sheet;
    if (!offer.publishable) {
      const minimum = offer.minimumContractPricePerKg === null ? "" : ` Precio mínimo de contrato para publicar: $ ${pesosPerKg(offer.minimumContractPricePerKg)} por kg.`;
      throw new RejectedError(`El proyecto no cumple la regla de oferta. ${offer.reasons.map((r) => r.message).join(" ")}${minimum}`);
    }
    await this.projects.updateStatus(project.id, PROJECT_STATUS.FUNDING_IN_PROGRESS);
    return { ...project, currentStatus: PROJECT_STATUS.FUNDING_IN_PROGRESS };
  }
}
