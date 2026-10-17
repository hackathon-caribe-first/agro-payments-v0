import { FORM_LEVEL_KEY, ValidationError } from "../../../shared/domain-errors";
import { parseCreateProjectRequest, parseEvidenceLogRequest } from "./api.requests";

const errorsOf = (fn: () => unknown) => {
  try {
    fn();
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return error.fieldErrors;
    throw error;
  }
};

// The body the web app's toCreateProjectRequestDto sends.
const body = () => ({
  title: "Café Castillo",
  description: "Establecimiento de plantas",
  production_type: "CAFE_ESPECIAL",
  start_date: "2026-11-01",
  estimated_end_date: "2027-03-30",
  milestones: [
    {
      title: "Siembra",
      description: "Siembra",
      estimated_completion_date: "2027-01-15",
      supplies_budget: 0,
      labor_budget: 300,
      sequence_order: 2,
      requirements_schema: { required_evidences: [] },
    },
    {
      title: "Preparación",
      description: "Limpieza",
      estimated_completion_date: "2026-12-01",
      supplies_budget: 100,
      labor_budget: 200,
      sequence_order: 1,
      requirements_schema: { required_evidences: [{ field_key: "photos", label: "Fotos", type: "photo_array", min_items: 2 }] },
    },
  ],
});

describe("parseCreateProjectRequest", () => {
  it("maps snake_case to the domain input, ordered by sequence_order", () => {
    expect(parseCreateProjectRequest(body())).toEqual({
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
          requirements: [{ fieldKey: "photos", label: "Fotos", type: "photo_array", minItems: 2 }],
        },
        { title: "Siembra", description: "Siembra", estimatedCompletionDate: "2027-01-15", suppliesBudget: 0, laborBudget: 300, requirements: [] },
      ],
    });
  });

  it("rejects a body that is not the request shape at form level, like the web app's mock server", () => {
    const expected = { [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] };
    expect(errorsOf(() => parseCreateProjectRequest(null))).toEqual(expected);
    expect(errorsOf(() => parseCreateProjectRequest({ ...body(), milestones: "x" }))).toEqual(expected);
    expect(errorsOf(() => parseCreateProjectRequest({ ...body(), milestones: [{ ...body().milestones[0], sequence_order: 0 }] }))).toEqual(expected);
  });

  it("rejects malformed requirements on the milestone", () => {
    const milestones = [{ ...body().milestones[0], requirements_schema: { required_evidences: [{ field_key: "", label: "x", type: "number" }] } }];
    expect(errorsOf(() => parseCreateProjectRequest({ ...body(), milestones }))).toEqual({ "milestones.0.requirementsSchema": ["Requisito de evidencia inválido."] });
  });

  it("passes wrong field types through so the domain reports them on the field", () => {
    expect(parseCreateProjectRequest({ ...body(), title: 5 }).title).toBe(5);
  });
});

describe("parseEvidenceLogRequest", () => {
  it("maps the snake_case body", () => {
    expect(parseEvidenceLogRequest({ log_type: "IOT_READING", notes: "n", evidence_payload: { a: 1 } })).toEqual({
      logType: "IOT_READING",
      notes: "n",
      evidencePayload: { a: 1 },
    });
  });

  it("rejects a non-object body at form level", () => {
    expect(errorsOf(() => parseEvidenceLogRequest("x"))).toEqual({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] });
  });
});
