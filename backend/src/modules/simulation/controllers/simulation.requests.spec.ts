import { ValidationError } from "../../../shared/domain-errors";
import { parseSimulationRequest } from "./simulation.requests";

const fieldErrors = (body: unknown) => {
  try {
    parseSimulationRequest(body);
  } catch (e) {
    if (e instanceof ValidationError) return e.fieldErrors;
    throw e;
  }
  throw new Error("expected a ValidationError");
};

describe("parseSimulationRequest", () => {
  it("takes a preset and optional snake_case overrides", () => {
    expect(parseSimulationRequest({ preset: "P2" })).toEqual({ preset: "P2", overrides: {} });
    expect(
      parseSimulationRequest({
        preset: "P1",
        contract_price_per_kg: 1126,
        offered_return_pct: 10.5,
        hectares: 12.5,
        cost_per_hectare: 7_000_000,
        expected_yield_kg_per_ha: 8_200,
        runs: 1_000,
        seed: 42,
      }),
    ).toEqual({
      preset: "P1",
      overrides: { contractPricePerKg: 1126, offeredReturnPct: 10.5, hectares: 12.5, costPerHectare: 7_000_000, expectedYieldKgPerHa: 8_200, runs: 1_000, seed: 42 },
    });
  });

  it("keys errors by the wire field", () => {
    expect(fieldErrors({ preset: "P9" })).toEqual({ preset: ["Elige un proyecto de referencia: P1 o P2."] });
    expect(fieldErrors({ preset: "P1", contract_price_per_kg: 0, runs: 2.5, seed: -1, hectares: "x" })).toEqual({
      contract_price_per_kg: ["Ingresa un número mayor a cero."],
      hectares: ["Ingresa un número mayor a cero."],
      runs: ["Ingresa un número entero de escenarios entre 1 y 100000."],
      seed: ["Ingresa una semilla entera entre 0 y 4294967295."],
    });
    expect(fieldErrors({ preset: "P1", offered_return_pct: 150 })).toEqual({ offered_return_pct: ["Ingresa un porcentaje entre 0 y 100."] });
    expect(fieldErrors(null)).toEqual({ _form: ["La solicitud no tiene el formato esperado."] });
  });
});
