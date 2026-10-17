import { RequestMethod } from "@nestjs/common";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { ROLES_KEY } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { simulate } from "../application/motor";
import { PRESETS } from "../application/presets";
import { SimulationController } from "./simulation.controller";
import { toPresetResponse, toSimulationResponse } from "./simulation.mappers";

const meta = (key: string, handler?: string) =>
  Reflect.getMetadata(key, handler ? (SimulationController.prototype as unknown as Record<string, object>)[handler] : SimulationController);
const route = (handler: string) => [RequestMethod[meta(METHOD_METADATA, handler)], `${meta(PATH_METADATA)}/${meta(PATH_METADATA, handler)}`];

describe("SimulationController", () => {
  it("uses ApiAuthGuard then RolesGuard and the /api error body", () => {
    expect(meta(GUARDS_METADATA)).toEqual([ApiAuthGuard, RolesGuard]);
    expect(meta(EXCEPTION_FILTERS_METADATA)).toEqual([ApiErrorFilter]);
  });

  it("serves the motor routes under /api", () => {
    expect(route("presets")).toEqual(["GET", "api/simulation/presets"]);
    expect(route("run")).toEqual(["POST", "api/projects/:projectId/simulation"]);
    expect(route("latest")).toEqual(["GET", "api/projects/:projectId/simulation"]);
    expect(route("publish")).toEqual(["POST", "api/projects/:projectId/publish"]);
  });

  it("lets the producer (seller), operator (admin) and fiduciaria (fidu) simulate; only producer and operator publish; everyone reads", () => {
    expect(meta(ROLES_KEY)).toEqual(["seller", "admin", "fidu", "investor"]);
    expect(meta(ROLES_KEY, "run")).toEqual(["seller", "admin", "fidu"]);
    expect(meta(ROLES_KEY, "publish")).toEqual(["seller", "admin"]);
    expect(meta(ROLES_KEY, "latest")).toBeUndefined();
    expect(meta(HTTP_CODE_METADATA, "run")).toBe(201);
    expect(meta(HTTP_CODE_METADATA, "publish")).toBe(200);
  });
});

describe("toSimulationResponse", () => {
  it("speaks snake_case with money in whole pesos and keeps the motor version and seed", () => {
    const sheet = simulate({ ...PRESETS.P2.inputs, runs: 300 });
    const response = toSimulationResponse({
      id: "r1",
      projectId: "p1",
      preset: "P2",
      inputs: { ...PRESETS.P2.inputs, runs: 300 },
      seed: sheet.seed,
      motorVersion: sheet.motorVersion,
      sheet,
      createdBy: "u1",
      createdAt: new Date("2026-10-17T10:00:00Z"),
    });
    expect(response).toMatchObject({
      id: "r1",
      project_id: "p1",
      preset: "P2",
      motor_version: "surco-motor@1.0.0",
      seed: 20_261_017,
      runs: 300,
      currency: "COP",
      created_at: "2026-10-17T10:00:00.000Z",
      capital: { capital: 76_240_458, investor_capital: 76_240_458, insurance_premium: 640_458, milestones_total: 75_600_000 },
      admission: { level: "B", passes_filters: true, milestone_range: { min: 3, max: 4 }, labor_line: true },
      coverage: { min_base: 1.3, min_stress: 1, passes: true },
      offer: { publishable: true, reasons: [], offered_return_pct: 12, contract_price_per_kg: 1_300 },
    });
    expect(response.milestones[0]).toEqual({ sequence: 1, title: "Montaje y trasplante", day: 0, share_pct: 50, budget: 37_800_000, supplies: 30_330_000, labor: 4_536_000, fee: 1_134_000, contingency: 1_800_000 });
    expect(response.currencies[1]).toMatchObject({ currency: "EUR", entry_rate: 3750, exits: [{ exit_rate: 3495 }, { exit_rate: 3913 }, { exit_rate: 4194 }] });
    expect(Object.keys(response.monte_carlo)).toEqual(["tir_pct", "recovery_pct", "prob_capital_loss_pct", "prob_value_preserved_pct"]);
  });

  it("lists presets with their headline inputs", () => {
    expect(toPresetResponse(PRESETS.P1)).toEqual({
      id: "P1",
      name: "P1 · Maíz, Tolima",
      description: PRESETS.P1.description,
      crop: "Maíz, Tolima",
      hectares: 20,
      days: 150,
      cost_per_hectare: 7_500_000,
      expected_yield_kg_per_ha: 8_000,
      contract_price_per_kg: 1_050,
      offered_return_pct: 12,
      currencies: ["USD"],
    });
  });
});
