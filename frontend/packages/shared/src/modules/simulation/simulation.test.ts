import type { ProjectDto } from "../projects/infrastructure/dto";
import { createSimulationMockFetch, type SimulationMockStore } from "./infrastructure/mock/mock-fetch";
import { createSimulationModule } from "./infrastructure/simulation-module";
import { toSheet } from "./infrastructure/mapper";
import { SHEET_FIXTURES } from "./infrastructure/mock/fixtures";

const draft: ProjectDto = {
  id: "p-draft",
  project_code: "AGR-2026-900",
  title: "Tomate bajo invernadero",
  production_type: "OTRO",
  description: "Ciclo de 120 días",
  target_amount: 0,
  custody_balance: 0,
  total_disbursed: 0,
  investor_roi_pct: 0,
  platform_fee_pct: 3,
  current_status: "DRAFT",
  start_date: "2026-11-01",
  estimated_end_date: "2027-03-01",
  currency: "COP",
};

function setup() {
  const store: SimulationMockStore = { simulationRuns: [], projects: [structuredClone(draft)], externalProjects: [] };
  const fallback: typeof fetch = async () => new Response(null, { status: 404 });
  return { store, simulation: createSimulationModule({ fetchFn: createSimulationMockFetch(store, fallback) }) };
}

describe("simulation sheet mapper", () => {
  it("maps the motor's snake_case sheet (whole pesos) to the domain", () => {
    const sheet = toSheet({ ...SHEET_FIXTURES.P2, id: "r1", project_id: "p1", created_at: "2026-10-17T10:00:00.000Z" });
    expect(sheet).toMatchObject({ id: "r1", projectId: "p1", motorVersion: "surco-motor@1.0.0", runs: 20000, level: "B", capital: 76_240_458, coverageMinBase: 1.3 });
    expect(sheet.offer).toMatchObject({ publishable: true, reasons: [], contractPricePerKg: 1300 });
    expect(sheet.milestones.map((m) => m.budget)).toEqual([37_800_000, 22_680_000, 15_120_000]);
    expect(sheet.currencies.map((c) => c.currency)).toEqual(["USD", "EUR"]);
    expect(() => toSheet({ id: "r1" })).toThrow(/Invalid simulation/);
  });
});

describe("simulation module over the mock server", () => {
  it("has no sheet until the project is simulated", async () => {
    const { simulation } = setup();
    expect(await simulation.getLatestSheet("p-draft")).toEqual({ ok: true, value: null });
  });

  it("refuses to publish P1 with the reasons and the minimum contract price (409), and keeps the project in draft", async () => {
    const { simulation, store } = setup();
    const run = await simulation.runSimulation("p-draft", { preset: "P1" });
    expect(run.ok && run.value.offer.publishable).toBe(false);
    const published = await simulation.publishProject("p-draft");
    expect(published.ok).toBe(false);
    if (!published.ok) {
      expect(published.error.kind).toBe("rejected");
      expect(published.error.kind === "rejected" && published.error.message).toMatch(/^El proyecto no cumple la regla de oferta\..*Precio mínimo de contrato para publicar: \$ 1\.346 por kg\.$/);
    }
    expect(store.projects[0].current_status).toBe("DRAFT");
  });

  it("publishes P2 (DRAFT → FUNDING_IN_PROGRESS) and then refuses a second publication", async () => {
    const { simulation, store } = setup();
    await simulation.runSimulation("p-draft", { preset: "P2" });
    expect((await simulation.getLatestSheet("p-draft")).ok).toBe(true);
    expect(await simulation.publishProject("p-draft")).toEqual({ ok: true, value: undefined });
    expect(store.projects[0].current_status).toBe("FUNDING_IN_PROGRESS");
    expect(await simulation.publishProject("p-draft")).toEqual({ ok: false, error: { kind: "rejected", message: "Solo se publica un proyecto en borrador." } });
  });

  it("re-simulating P1 at the minimum contract price makes it publishable", async () => {
    const { simulation } = setup();
    const run = await simulation.runSimulation("p-draft", { preset: "P1", contractPricePerKg: 1346 });
    expect(run.ok && run.value.offer).toMatchObject({ publishable: true, contractPricePerKg: 1346 });
  });

  it("reports an unknown preset as a field error", async () => {
    const { simulation } = setup();
    expect(await simulation.runSimulation("p-draft", { preset: "P9" })).toEqual({
      ok: false,
      error: { kind: "validation", fieldErrors: { preset: ["Elige un proyecto de referencia: P1 o P2."] } },
    });
  });
});
