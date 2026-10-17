// RF-02/RF-03: the nine elimination filters with their evidence, and the A15 score → level → milestones, financeable %
// and jornales line. The score and level come from the motor (admission(), A15); this file only adds the PRD's
// «Niveles de admisión» table and the evidence rule.
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { addFieldError, type FieldErrors, NotFoundError, ValidationError } from "../../../shared/domain-errors";
import { canView, type Viewer } from "../../projects/application/project";
import { ProjectRepository } from "../../projects/ports/project.repository";
import { AdmissionRepository } from "../ports/admission.repository";
import { admission, ELIMINATION_FILTERS, LEVEL, type Level, MOTOR_VERSION, type MilestoneRange } from "./motor";

/** A15 blocks X_m in the motor's weight order (20/20/20/15/10/10/5). */
export const ADMISSION_BLOCKS = ["comercial", "capacidad_pago", "tecnico", "historial", "tenencia", "clima", "asociatividad"] as const;
export type AdmissionBlock = (typeof ADMISSION_BLOCKS)[number];

export type FilterInput = { passes: boolean; evidence: string };
export type AdmissionRequest = { filters: FilterInput[]; blocks: Record<AdmissionBlock, number> };

export type FinanceablePct = { min: number | null; max: number };
// «Niveles de admisión»: A hasta 100 %, B 70–80 %, C ≤ 50 % (vía asociación), primer ciclo «monto pequeño, en grupo» (no %).
const FINANCEABLE: Record<Level, FinanceablePct | null> = {
  [LEVEL.A]: { min: null, max: 100 },
  [LEVEL.B]: { min: 70, max: 80 },
  [LEVEL.C]: { min: null, max: 50 },
  [LEVEL.FIRST_CYCLE]: null,
};

export type AdmissionOutcome = {
  /** RF-02 binary result: every filter passed. */
  admitted: boolean;
  failedFilters: string[];
  score: number;
  level: Level;
  /** PRD «Hitos por nivel»: the range minimum (B → 3); null in primer ciclo (paid in kind). */
  milestones: number | null;
  milestoneRange: MilestoneRange | null;
  financeablePct: FinanceablePct | null;
  laborLine: boolean;
};

export type ProjectAdmission = {
  id: string;
  projectId: string;
  filters: (FilterInput & { name: string })[];
  blocks: Record<AdmissionBlock, number>;
  outcome: AdmissionOutcome;
  motorVersion: string;
  createdBy: string;
  createdAt: Date;
};

export function admissionOutcome(request: AdmissionRequest): AdmissionOutcome {
  const result = admission({ filters: request.filters.map((f) => f.passes), blocks: ADMISSION_BLOCKS.map((b) => request.blocks[b]) });
  return {
    admitted: result.passesFilters,
    failedFilters: result.failedFilters,
    score: result.score,
    level: result.level,
    milestones: result.milestoneRange?.min ?? null,
    milestoneRange: result.milestoneRange,
    financeablePct: FINANCEABLE[result.level],
    laborLine: result.laborLine,
  };
}

const EVIDENCE_MAX = 500;

/** RF-02 «con evidencia»: each of the nine filters says what supports it, whatever its result. Errors keyed by wire path. */
export function validateAdmissionRequest(request: AdmissionRequest): AdmissionRequest {
  const errors: FieldErrors = {};
  if (!Array.isArray(request.filters) || request.filters.length !== ELIMINATION_FILTERS.length) {
    addFieldError(errors, "filters", `Responde los ${ELIMINATION_FILTERS.length} filtros.`);
  } else {
    request.filters.forEach((f, i) => {
      if (typeof f?.passes !== "boolean") addFieldError(errors, `filters.${i}.passes`, "Indica si el filtro se cumple.");
      if (typeof f?.evidence !== "string" || f.evidence.trim() === "") addFieldError(errors, `filters.${i}.evidence`, "Agrega la evidencia del filtro.");
      else if (f.evidence.length > EVIDENCE_MAX) addFieldError(errors, `filters.${i}.evidence`, `Máximo ${EVIDENCE_MAX} caracteres.`);
    });
  }
  for (const block of ADMISSION_BLOCKS) {
    const x = request.blocks?.[block];
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 100) addFieldError(errors, `blocks.${block}`, "Ingresa un puntaje entre 0 y 100.");
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors, "Invalid admission");
  return { filters: request.filters.map((f) => ({ passes: f.passes, evidence: f.evidence.trim() })), blocks: request.blocks };
}

// The verifier assesses the filters (PRD «Fase 0»: evidencia del productor y del verificador) but is not a project reader.
const ASSESSORS: readonly string[] = ["admin", "verifier"];
const canAccess = (project: Parameters<typeof canView>[0], viewer: Viewer) => ASSESSORS.includes(viewer.role) || canView(project, viewer);

@Injectable()
export class AdmissionUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly admissions: AdmissionRepository,
  ) {}

  private async project(id: string, viewer: Viewer) {
    const project = await this.projects.findById(id);
    if (!project || !canAccess(project, viewer)) throw new NotFoundError(`Project ${id} not found`);
    return project;
  }

  async assess(projectId: string, viewer: Viewer, request: AdmissionRequest): Promise<ProjectAdmission> {
    const project = await this.project(projectId, viewer);
    const valid = validateAdmissionRequest(request);
    const assessed: ProjectAdmission = {
      id: randomUUID(),
      projectId: project.id,
      filters: valid.filters.map((f, i) => ({ name: ELIMINATION_FILTERS[i], ...f })),
      blocks: valid.blocks,
      outcome: admissionOutcome(valid),
      motorVersion: MOTOR_VERSION,
      createdBy: viewer.id,
      createdAt: new Date(),
    };
    await this.admissions.save(assessed);
    return assessed;
  }

  async latest(projectId: string, viewer: Viewer): Promise<ProjectAdmission> {
    const project = await this.project(projectId, viewer);
    const found = await this.admissions.findLatest(project.id);
    if (!found) throw new NotFoundError(`Project ${projectId} has no admission yet`);
    return found;
  }
}
