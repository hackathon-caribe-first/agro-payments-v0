import type { ProjectDto } from "../projects/infrastructure/dto";
import { rateText } from "./domain/investment";
import { createInvestmentsMockFetch } from "./infrastructure/mock/mock-fetch";
import { createInvestmentsModule } from "./infrastructure/investments-module";

const project = (overrides: Partial<ProjectDto> = {}): ProjectDto => ({
  id: "p1",
  project_code: "AGR-2026-001",
  title: "Café especial",
  production_type: "CAFE_ESPECIAL",
  description: "Ciclo de café",
  target_amount: 1_000_000,
  custody_balance: 0,
  total_disbursed: 0,
  investor_roi_pct: 0,
  platform_fee_pct: 3,
  current_status: "DRAFT",
  start_date: "2026-11-01",
  estimated_end_date: "2027-05-01",
  currency: "COP",
  ...overrides,
});

const setup = () => {
  const store = { projects: [project(), project({ id: "p2", current_status: "IN_EXECUTION" })] };
  const fetchFn = createInvestmentsMockFetch(store, async () => new Response(null, { status: 404 }));
  return { store, investments: createInvestmentsModule({ fetchFn }) };
};

describe("rateText", () => {
  it("shows an exact n/d rate as es-CO decimals, rounded half up", () => {
    expect(rateText("40000/9")).toBe("4.444,44");
    expect(rateText("1/1")).toBe("1,00");
    expect(rateText("2/3", 4)).toBe("0,6667");
    expect(rateText("not a rate")).toBeNull();
  });
});

describe("investments module over the mock", () => {
  it("lists only the projects still raising, with their capture bar", async () => {
    const result = await setup().investments.listFundable();
    expect(result.ok && result.value.map((p) => [p.project.id, p.capture.progressPct])).toEqual([["p1", 0]]);
  });

  it("captures a EUR investment at once with the simulated rate and fills the bar", async () => {
    const { investments, store } = setup();
    const done = await investments.invest("p1", { amount: "100000", walletAddress: "https://ilp.test/inversionista_eur" });
    expect(done).toMatchObject({ ok: true, value: { status: "CAPTURED", amount: 100_000, quote: { debitAmount: "2273", debitAssetCode: "EUR" } } });
    const page = await investments.getProjectPage("p1");
    expect(page.ok && page.value.capture).toMatchObject({ raised: 100_000, progressPct: 10, investorsCount: 1, byCurrency: [{ currency: "EUR", debited: "2273", receivedCop: 100_000 }] });
    expect(page.ok && page.value.investments).toHaveLength(1);
    expect(store.projects[0]).toMatchObject({ custody_balance: 100_000, current_status: "FUNDING_IN_PROGRESS" });
  });

  it("validates the form and surfaces the server's refusals as field errors", async () => {
    const { investments } = setup();
    expect(await investments.invest("p1", { amount: "0", walletAddress: "http://x" })).toMatchObject({
      ok: false,
      error: { kind: "validation", fieldErrors: { amount: [expect.any(String)], wallet_address: [expect.any(String)] } },
    });
    // 10 % cap of a 1.000.000 project.
    expect(await investments.invest("p1", { amount: "100001", walletAddress: "https://ilp.test/a" })).toMatchObject({
      ok: false,
      error: { kind: "validation", fieldErrors: { _form: [expect.stringContaining("10 %")] } },
    });
  });

  it("an unknown project is not_found", async () => {
    expect(await setup().investments.getProjectPage("nope")).toEqual({ ok: false, error: { kind: "not_found" } });
  });
});
