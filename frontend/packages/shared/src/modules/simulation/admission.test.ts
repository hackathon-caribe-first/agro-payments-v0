import type { ProjectDto } from "../projects/infrastructure/dto";
import { ADMISSION_BLOCKS, ELIMINATION_FILTERS, type AdmissionResponse } from "./domain/admission";
import { createSimulationMockFetch, type SimulationMockStore } from "./infrastructure/mock/mock-fetch";
import { parseAdmissionForm, toAdmissionFieldErrors } from "./schemas/admission-form";

const SCORES = { comercial: "80", capacidad_pago: "70", tecnico: "60", historial: "50", tenencia: "90", clima: "40", asociatividad: "100" };

function filledForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  ELIMINATION_FILTERS.forEach((_, i) => {
    form.set(`filters.${i}.passes`, "true");
    form.set(`filters.${i}.evidence`, ` Soporte ${i + 1} `);
  });
  for (const [block, value] of Object.entries(SCORES)) form.set(`blocks.${block}`, value);
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("admission form → POST /projects/:id/admission request (RF-02/RF-03)", () => {
  it("maps the nine filters (in order, evidence trimmed) and the seven block scores", () => {
    const parsed = parseAdmissionForm(filledForm({ "filters.2.passes": "false" }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request.filters).toHaveLength(9);
    expect(parsed.request.filters[0]).toEqual({ passes: true, evidence: "Soporte 1" });
    expect(parsed.request.filters[2]).toEqual({ passes: false, evidence: "Soporte 3" });
    expect(parsed.request.blocks).toEqual({ comercial: 80, capacidad_pago: 70, tecnico: 60, historial: 50, tenencia: 90, clima: 40, asociatividad: 100 });
    expect(Object.keys(parsed.request.blocks)).toEqual(ADMISSION_BLOCKS.map((b) => b.key));
  });

  it("reports each missing answer, blank evidence and out-of-range score under its own field", () => {
    const form = filledForm({ "filters.1.evidence": "   ", "blocks.clima": "101", "blocks.tecnico": "" });
    form.delete("filters.0.passes");
    const parsed = parseAdmissionForm(form);
    expect(parsed).toEqual({
      ok: false,
      fieldErrors: {
        "filters.0.passes": ["Indica si el filtro se cumple."],
        "filters.1.evidence": ["Agrega la evidencia del filtro."],
        "blocks.tecnico": ["Ingresa un puntaje entre 0 y 100."],
        "blocks.clima": ["Ingresa un puntaje entre 0 y 100."],
      },
    });
  });

  it("limits the evidence to 500 characters, like the backend", () => {
    const parsed = parseAdmissionForm(filledForm({ "filters.4.evidence": "x".repeat(501) }));
    expect(!parsed.ok && parsed.fieldErrors).toEqual({ "filters.4.evidence": ["Máximo 500 caracteres."] });
  });
});

describe("admission server errors", () => {
  it("keeps per-field keys and moves list-level or unknown keys to the form level", () => {
    expect(
      toAdmissionFieldErrors({
        "filters.3.evidence": ["Agrega la evidencia del filtro."],
        "blocks.clima": ["Ingresa un puntaje entre 0 y 100."],
        filters: ["Responde los 9 filtros."],
        _form: ["La solicitud no tiene el formato esperado."],
      }),
    ).toEqual({
      "filters.3.evidence": ["Agrega la evidencia del filtro."],
      "blocks.clima": ["Ingresa un puntaje entre 0 y 100."],
      _form: ["Responde los 9 filtros.", "La solicitud no tiene el formato esperado."],
    });
  });
});

describe("admission over the mock server", () => {
  const project = { id: "p1" } as ProjectDto;
  const setup = () => {
    const store: SimulationMockStore = { simulationRuns: [], projects: [project], externalProjects: [] };
    const fetchFn = createSimulationMockFetch(store, async () => new Response(null, { status: 404 }));
    return { store, fetchFn };
  };
  const post = (fetchFn: typeof fetch, body: unknown) =>
    fetchFn("/api/projects/p1/admission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("scores with the A15 weights, stores it and returns it as the latest", async () => {
    const { fetchFn } = setup();
    expect((await fetchFn("/api/projects/p1/admission")).status).toBe(404);
    const parsed = parseAdmissionForm(filledForm());
    if (!parsed.ok) throw new Error("form should be valid");
    const created = await post(fetchFn, parsed.request);
    expect(created.status).toBe(201);
    // 0.2·80 + 0.2·70 + 0.2·60 + 0.15·50 + 0.1·90 + 0.1·40 + 0.05·100 = 67.5 → B
    const body = (await created.json()) as AdmissionResponse;
    expect(body).toMatchObject({ admitted: true, score: 67.5, level: "B", milestones: 3, financeable_pct: { min: 70, max: 80 }, labor_line: true, failed_filters: [] });
    expect(await (await fetchFn("/api/projects/p1/admission")).json()).toMatchObject({ id: body.id, level: "B" });
  });

  it("scores 0 (primer ciclo, no jornales) when a filter fails, and answers 400 with field errors", async () => {
    const { fetchFn } = setup();
    const parsed = parseAdmissionForm(filledForm({ "filters.6.passes": "false" }));
    if (!parsed.ok) throw new Error("form should be valid");
    const body = (await (await post(fetchFn, parsed.request)).json()) as AdmissionResponse;
    expect(body).toMatchObject({ admitted: false, failed_filters: ["Sin agua"], score: 0, level: "primer_ciclo", milestones: null, financeable_pct: null, labor_line: false });

    const invalid = await post(fetchFn, { filters: [], blocks: {} });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { errors: Record<string, string[]> }).errors).toMatchObject({ filters: ["Responde los 9 filtros."], "blocks.comercial": ["Ingresa un puntaje entre 0 y 100."] });
  });
});
