import type { ProjectDto } from "../../../projects/infrastructure/dto";
import {
  ADMISSION_BLOCKS,
  ADMISSION_LEVEL,
  ELIMINATION_FILTERS,
  EVIDENCE_MAX_LENGTH,
  type AdmissionLevel,
  type AdmissionRequest,
  type AdmissionResponse,
  type FinanceablePct,
  type MilestoneRange,
} from "../../domain/admission";
import { simulationDtoSchema, type SimulationDto } from "../dto";
import { PRESET_FIXTURES, SHEET_FIXTURES } from "./fixtures";

// The slice of the shared mock store the simulation needs: its own runs plus the projects it publishes.
export interface SimulationMockStore {
  simulationRuns: SimulationDto[];
  projects: ProjectDto[];
  externalProjects: ProjectDto[];
  /** RF-02/RF-03; created on the first assessment. */
  admissions?: AdmissionResponse[];
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rejected = (message: string) => json({ error: "Request rejected", errors: { _form: [message] } }, 409);
const pesos = (n: number) => n.toLocaleString("es-CO");

// ponytail: the mock cannot run the motor; a run returns the preset's precomputed sheet. A contract price at or above the
// sheet's minimum flips it to publishable (what the real motor answers at that price); any other price keeps the verdict.
function sheetFor(projectId: string, preset: string, price: number | undefined, n: number): SimulationDto {
  const sheet = simulationDtoSchema.parse({ ...structuredClone(SHEET_FIXTURES[preset]), id: `mock-run-${n}`, project_id: projectId, created_at: new Date().toISOString() });
  if (price === undefined) return sheet;
  const minimum = sheet.offer.minimum_contract_price_per_kg;
  const passes = minimum !== null && price >= minimum;
  return { ...sheet, offer: { ...sheet.offer, contract_price_per_kg: price, publishable: passes || sheet.offer.publishable, reasons: passes ? [] : sheet.offer.reasons } };
}

// ponytail: mirrors the backend motor's admission() (A15 weights, level thresholds 75/60/50) and the PRD tables, so mock mode
// answers like the server; the real numbers always come from the backend.
const LEVEL_MILESTONES: Record<AdmissionLevel, MilestoneRange | null> = { A: { min: 2, max: 3 }, B: { min: 3, max: 4 }, C: { min: 3, max: 4 }, primer_ciclo: null };
const FINANCEABLE: Record<AdmissionLevel, FinanceablePct | null> = { A: { min: null, max: 100 }, B: { min: 70, max: 80 }, C: { min: null, max: 50 }, primer_ciclo: null };

function admissionErrors(body: Partial<AdmissionRequest>): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const add = (key: string, message: string) => (errors[key] ??= []).push(message);
  if (!Array.isArray(body.filters) || body.filters.length !== ELIMINATION_FILTERS.length) add("filters", `Responde los ${ELIMINATION_FILTERS.length} filtros.`);
  else
    body.filters.forEach((f, i) => {
      if (typeof f?.passes !== "boolean") add(`filters.${i}.passes`, "Indica si el filtro se cumple.");
      if (typeof f?.evidence !== "string" || f.evidence.trim() === "") add(`filters.${i}.evidence`, "Agrega la evidencia del filtro.");
      else if (f.evidence.length > EVIDENCE_MAX_LENGTH) add(`filters.${i}.evidence`, `Máximo ${EVIDENCE_MAX_LENGTH} caracteres.`);
    });
  for (const { key } of ADMISSION_BLOCKS) {
    const x = body.blocks?.[key];
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 100) add(`blocks.${key}`, "Ingresa un puntaje entre 0 y 100.");
  }
  return errors;
}

function assess(projectId: string, request: AdmissionRequest, n: number): AdmissionResponse {
  const failed = ELIMINATION_FILTERS.filter((_, i) => !request.filters[i].passes);
  const raw = ADMISSION_BLOCKS.reduce((sum, b) => sum + b.weight * request.blocks[b.key], 0) / 100;
  const score = failed.length > 0 ? 0 : Math.round(raw * 100) / 100;
  const level = score >= 75 ? ADMISSION_LEVEL.A : score >= 60 ? ADMISSION_LEVEL.B : score >= 50 ? ADMISSION_LEVEL.C : ADMISSION_LEVEL.FIRST_CYCLE;
  return {
    id: `mock-admission-${n}`,
    project_id: projectId,
    admitted: failed.length === 0,
    failed_filters: [...failed],
    score,
    level,
    milestones: LEVEL_MILESTONES[level]?.min ?? null,
    milestone_range: LEVEL_MILESTONES[level],
    financeable_pct: FINANCEABLE[level],
    labor_line: level === ADMISSION_LEVEL.A || level === ADMISSION_LEVEL.B,
    filters: request.filters.map((f, i) => ({ name: ELIMINATION_FILTERS[i], passes: f.passes, evidence: f.evidence.trim() })),
    blocks: request.blocks,
    motor_version: "surco-motor@1.0.0",
    created_by: "mock-producer",
    created_at: new Date().toISOString(),
  };
}

// GET /simulation/presets, GET|POST /projects/:id/simulation and POST /projects/:id/publish; everything else is delegated.
export function createSimulationMockFetch(store: SimulationMockStore, delegate: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");

    if (method === "GET" && path === "/simulation/presets") return json(PRESET_FIXTURES);

    const admission = path.match(/^\/projects\/([^/]+)\/admission$/);
    if (admission) {
      const projectId = decodeURIComponent(admission[1]);
      if (![...store.projects, ...store.externalProjects].some((p) => p.id === projectId)) return json({ error: "Project not found", errors: {} }, 404);
      const admissions = (store.admissions ??= []);
      if (method === "GET") {
        const latest = admissions.filter((a) => a.project_id === projectId).at(-1);
        return latest ? json(latest) : json({ error: "No admission yet", errors: {} }, 404);
      }
      if (method === "POST") {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Partial<AdmissionRequest>;
        const errors = admissionErrors(body);
        if (Object.keys(errors).length > 0) return json({ error: "Invalid admission", errors }, 400);
        const assessed = assess(projectId, body as AdmissionRequest, admissions.length + 1);
        admissions.push(assessed);
        return json(assessed, 201);
      }
    }

    const match = path.match(/^\/projects\/([^/]+)\/(simulation|publish)$/);
    if (!match) return delegate(input, init);
    const projectId = decodeURIComponent(match[1]);
    const project = [...store.projects, ...store.externalProjects].find((p) => p.id === projectId);
    if (!project) return json({ error: "Project not found", errors: {} }, 404);
    const latest = store.simulationRuns.filter((r) => r.project_id === projectId).at(-1);

    if (match[2] === "simulation" && method === "GET") return latest ? json(latest) : json({ error: "No simulation", errors: {} }, 404);
    if (match[2] === "simulation" && method === "POST") {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { preset?: string; contract_price_per_kg?: unknown };
      if (!body.preset || !(body.preset in SHEET_FIXTURES)) return json({ error: "Invalid simulation payload", errors: { preset: ["Elige un proyecto de referencia: P1 o P2."] } }, 400);
      const price = body.contract_price_per_kg;
      if (price !== undefined && !(typeof price === "number" && price > 0)) return json({ error: "Invalid", errors: { contract_price_per_kg: ["Ingresa un número mayor a cero."] } }, 400);
      const run = sheetFor(projectId, body.preset, price as number | undefined, store.simulationRuns.length + 1);
      store.simulationRuns.push(run);
      return json(run, 201);
    }
    if (match[2] === "publish" && method === "POST") {
      if (project.current_status !== "DRAFT") return rejected("Solo se publica un proyecto en borrador.");
      if (!latest) return rejected("Simula el proyecto antes de publicarlo: la ficha decide si se puede ofrecer.");
      if (!latest.offer.publishable) {
        const minimum = latest.offer.minimum_contract_price_per_kg;
        const tail = minimum === null ? "" : ` Precio mínimo de contrato para publicar: $ ${pesos(minimum)} por kg.`;
        return rejected(`El proyecto no cumple la regla de oferta. ${latest.offer.reasons.map((r) => r.message).join(" ")}${tail}`);
      }
      project.current_status = "FUNDING_IN_PROGRESS";
      return json(project);
    }
    return delegate(input, init);
  };
}
