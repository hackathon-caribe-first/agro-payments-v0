import { describe, expect, it } from "vitest";
import { toCreateProjectRequestDto, toProject } from "./infrastructure/mapper";
import { createProjectInputSchema } from "./schemas/create-project";

const square = { type: "Polygon" as const, coordinates: [[[-74.1, 4.6], [-74.0, 4.6], [-74.0, 4.7], [-74.1, 4.7], [-74.1, 4.6]]] as [number, number][][] };
const draft = {
  title: "Maíz P1",
  description: "Maíz en dos hectáreas",
  productionType: "OTRO" as const,
  startDate: "2026-11-01",
  estimatedEndDate: "2027-03-30",
  milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 100, laborBudget: 200 }],
};
const dto = {
  id: "p1",
  project_code: "AGR-2026-001",
  title: "Maíz P1",
  production_type: "OTRO",
  description: "Maíz",
  target_amount: 300,
  custody_balance: 0,
  total_disbursed: 0,
  investor_roi_pct: 0,
  platform_fee_pct: 3,
  current_status: "DRAFT",
  start_date: "2026-11-01",
  estimated_end_date: "2027-03-30",
  currency: "COP",
};

describe("project intake (RF-01): plot polygon and producer wallet", () => {
  it("keeps the existing form valid without them", () => {
    expect(createProjectInputSchema.safeParse(draft).success).toBe(true);
  });

  it("accepts a closed polygon and an https wallet, and sends them snake_case", () => {
    const parsed = createProjectInputSchema.parse({ ...draft, plotPolygon: square, producerWalletAddress: "https://ilp.test/productor" });
    expect(toCreateProjectRequestDto(parsed)).toMatchObject({ plot_polygon: square, producer_wallet_address: "https://ilp.test/productor" });
    expect(toCreateProjectRequestDto(createProjectInputSchema.parse(draft))).not.toHaveProperty("plot_polygon");
  });

  it("rejects an open ring and a non-https wallet with the backend's messages", () => {
    const open = { type: "Polygon" as const, coordinates: [square.coordinates[0].slice(0, 4)] };
    const result = createProjectInputSchema.safeParse({ ...draft, plotPolygon: open, producerWalletAddress: "http://x.test" });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toContain("El contorno del lote debe cerrar en el punto donde empieza.");
    expect(messages).toContain("La billetera debe ser una dirección https.");
  });

  it("reads the fields back only when the API sends them", () => {
    expect(toProject(dto)).not.toHaveProperty("plotPolygon");
    expect(toProject({ ...dto, plot_polygon: square, producer_wallet_address: "https://ilp.test/p" })).toMatchObject({ plotPolygon: square, producerWalletAddress: "https://ilp.test/p" });
  });
});
