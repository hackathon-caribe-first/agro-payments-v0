import type { ProjectDto } from "../../../projects/infrastructure/dto";
import { simulationDtoSchema, type SimulationDto } from "../dto";
import { PRESET_FIXTURES, SHEET_FIXTURES } from "./fixtures";

// The slice of the shared mock store the simulation needs: its own runs plus the projects it publishes.
export interface SimulationMockStore {
  simulationRuns: SimulationDto[];
  projects: ProjectDto[];
  externalProjects: ProjectDto[];
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

// GET /simulation/presets, GET|POST /projects/:id/simulation and POST /projects/:id/publish; everything else is delegated.
export function createSimulationMockFetch(store: SimulationMockStore, delegate: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");

    if (method === "GET" && path === "/simulation/presets") return json(PRESET_FIXTURES);

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
