import type { ProjectDto } from "../projects/infrastructure/dto";
import { spentPct } from "./domain/harvest";
import { createHarvestModule } from "./infrastructure/harvest-module";
import { createHarvestMockFetch } from "./infrastructure/mock/mock-fetch";

const project = (overrides: Partial<ProjectDto> = {}): ProjectDto => ({
  id: "p1",
  project_code: "AGR-2026-001",
  title: "Café especial",
  production_type: "CAFE_ESPECIAL",
  description: "Ciclo de café",
  target_amount: 1_000_000,
  custody_balance: 1_000_000,
  total_disbursed: 0,
  investor_roi_pct: 0,
  platform_fee_pct: 3,
  current_status: "IN_EXECUTION",
  start_date: "2026-11-01",
  estimated_end_date: "2027-05-01",
  currency: "COP",
  ...overrides,
});

const setup = () => {
  const store: Parameters<typeof createHarvestMockFetch>[0] = { projects: [project()], milestones: [], ledgerEntries: [] };
  const fetchFn = createHarvestMockFetch(store, async () => new Response(null, { status: 404 }));
  return { store, harvest: createHarvestModule({ fetchFn }) };
};

describe("harvest module over the mock (RF-24)", () => {
  it("runs declare → certify → pay → reception, crediting custody with Q·P_g", async () => {
    const { harvest, store } = setup();
    expect(await harvest.get("p1")).toMatchObject({ ok: true, value: { harvest: null, projectStatus: "IN_EXECUTION" } });
    expect(await harvest.declare("p1", { quantityKg: "1.000", qualityGrade: "Excelso", evidence: "Fotos en bodega" })).toMatchObject({
      ok: true,
      value: { projectStatus: "HARVEST_DECLARED", harvest: { status: "DECLARED", declaredQuantityKg: 1_000 } },
    });
    expect(await harvest.certify("p1", { quantityKg: "900", qualityGrade: "Excelso", notes: "", pricePerKg: "12000" })).toMatchObject({
      ok: true,
      value: { projectStatus: "HARVEST_CERTIFIED", harvest: { amountDue: 10_800_000, certificationNotes: null } },
    });
    expect((await harvest.listForReview()).ok).toBe(true);
    expect(await harvest.pay("p1")).toMatchObject({ ok: true, value: { projectStatus: "MARKET_PAYMENT_HELD", paymentRedirectUrl: null } });
    expect(store.ledgerEntries).toEqual([expect.objectContaining({ category: "HARVEST_PAYMENT", amount: 10_800_000 })]);
    expect(await harvest.custody("p1")).toMatchObject({ ok: true, value: { balance: 11_800_000, credits: [{ category: "HARVEST_PAYMENT", amount: 10_800_000 }] } });
    expect(await harvest.confirmReception("p1")).toMatchObject({ ok: true, value: { projectStatus: "DELIVERED_TO_BUYER", harvest: { status: "RECEIVED" } } });
  });

  it("validates the forms with the wire keys and surfaces refusals as form errors", async () => {
    const { harvest } = setup();
    expect(await harvest.declare("p1", { quantityKg: "1,5", qualityGrade: "", evidence: "x" })).toMatchObject({
      ok: false,
      error: { kind: "validation", fieldErrors: { quantity_kg: [expect.any(String)], quality_grade: [expect.any(String)], evidence: [expect.any(String)] } },
    });
    expect(await harvest.certify("p1", { quantityKg: "900", qualityGrade: "A", notes: "", pricePerKg: "0" })).toMatchObject({
      ok: false,
      error: { kind: "validation", fieldErrors: { "price.price_per_kg": [expect.any(String)] } },
    });
    expect(await harvest.pay("p1")).toMatchObject({ ok: false, error: { kind: "validation", fieldErrors: { _form: [expect.stringContaining("certificada")] } } });
  });

  it("reads custody with the premium DEBIT already out of custody_balance (never subtracted twice) and the indemnity as a credit", async () => {
    const { harvest, store } = setup();
    const entry = (type: string, category: string, amount: number) => ({ id: `led-${category}`, project_id: "p1", type, category, amount, currency: "COP", negotiation_id: "", buyer_id: "", created_at: "2026-11-02T00:00:00.000Z" });
    // 1,000,000 seeded − premium 150,000 + indemnity 300,000, as the contracts mock books them.
    store.projects[0].custody_balance = 1_000_000 - 150_000 + 300_000;
    store.ledgerEntries.push(entry("DEBIT", "PREMIUM", 150_000), entry("CREDIT", "INDEMNITY", 300_000));
    expect(await harvest.custody("p1")).toMatchObject({
      ok: true,
      value: {
        balance: 1_150_000,
        credited: 1_300_000,
        credits: [{ category: "INDEMNITY", amount: 300_000 }],
        debits: [{ category: "PREMIUM", amount: 150_000 }],
        ledgerDebits: 150_000,
        debited: 150_000,
        milestoneDebits: 0,
      },
    });
  });

  it("reads the investor panel with realized TIR pending before the settlement, and not_found for an unknown project", async () => {
    const { harvest } = setup();
    expect(await harvest.panel("p1")).toMatchObject({ ok: true, value: { realized: { status: "pending" }, custody: { balance: 1_000_000 }, median: null } });
    expect(await harvest.panel("nope")).toEqual({ ok: false, error: { kind: "not_found" } });
  });
});

describe("spentPct", () => {
  it("is spent over cap, capped at 100", () => {
    expect(spentPct({ cap: 200, spent: 50 })).toBe(25);
    expect(spentPct({ cap: 0, spent: 0 })).toBe(0);
    expect(spentPct({ cap: 10, spent: 20 })).toBe(100);
  });
});
