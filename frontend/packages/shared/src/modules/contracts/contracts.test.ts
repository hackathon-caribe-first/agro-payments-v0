import { custodyBalance } from "../escrow/domain/ledger";
import type { LedgerEntryDto } from "../escrow/infrastructure/dto";
import { toLedgerEntries } from "../escrow/infrastructure/mapper";
import type { ProjectDto } from "../projects/infrastructure/dto";
import { createContractsModule } from "./infrastructure/contracts-module";
import { type ContractsMockStore, createContractsMockFetch } from "./infrastructure/mock/mock-fetch";

const project = (id: string, status: ProjectDto["current_status"], custody = 0): ProjectDto => ({
  id,
  project_code: "AGR-2026-900",
  title: "Tomate bajo invernadero",
  production_type: "OTRO",
  description: "Ciclo de 120 días",
  target_amount: 0,
  custody_balance: custody,
  total_disbursed: 0,
  investor_roi_pct: 0,
  platform_fee_pct: 3,
  current_status: status,
  start_date: "2026-11-01",
  estimated_end_date: "2027-03-01",
  currency: "COP",
});

function setup() {
  const store: ContractsMockStore = { projects: [project("p-draft", "DRAFT"), project("p-funded", "FUNDED_IN_CUSTODY", 10_000_000)], externalProjects: [], ledgerEntries: [] };
  const fallback: typeof fetch = async () => new Response(null, { status: 404 });
  return { store, contracts: createContractsModule({ fetchFn: createContractsMockFetch(store, fallback) }) };
}

const purchase = { priceType: "fixed" as const, pricePerUnit: 1300, quantity: 85_000, unit: "kg" as const, currency: "COP" as const, buyerEmail: "comprador@agro.dev", buyerWalletAddress: "https://wallet.test/comprador" };
const policy = { insurerName: "Aseguradora Demo", insurerWalletAddress: "https://wallet.test/aseguradora", premium: 1_000_000, hectares: 10, expectedYieldKgPerHa: 1000, insuredPricePerKg: 1000 };

describe("contracts module over the mock transport", () => {
  it("reads nothing before the producer saves a purchase contract, then reads it back", async () => {
    const { contracts } = setup();
    expect(await contracts.getPurchaseContract("p-draft")).toEqual({ ok: true, value: null });
    const saved = await contracts.savePurchaseContract("p-draft", purchase);
    expect(saved.ok && saved.value).toMatchObject({ priceType: "fixed", pricePerUnit: 1300, quantity: 85_000, buyerEmail: "comprador@agro.dev" });
    expect((await contracts.getPurchaseContract("p-draft")).ok).toBe(true);
  });

  it("maps a 400 to field errors", async () => {
    const { contracts } = setup();
    const result = await contracts.savePurchaseContract("p-draft", { ...purchase, buyerWalletAddress: "http://inseguro" });
    expect(result).toEqual({ ok: false, error: { kind: "validation", fieldErrors: { buyer_wallet_address: ["Ingresa una dirección de wallet https."] } } });
  });

  it("nets the ISA subsidy, pays the premium from custody once and books it as a DEBIT", async () => {
    const { contracts, store } = setup();
    const saved = await contracts.savePolicy("p-funded", policy);
    expect(saved.ok && saved.value).toMatchObject({ premium: 1_000_000, subsidyPct: 85, netPremium: 150_000, beneficiary: "PATRIMONIO_AUTONOMO", premiumPayment: null });
    const paid = await contracts.payPremium("p-funded");
    expect(paid.ok && paid.value.premiumPayment).toMatchObject({ amount: 150_000, status: "completed" });
    expect(store.ledgerEntries).toMatchObject([{ type: "DEBIT", category: "PREMIUM", amount: 150_000 }]);
    expect(await contracts.payPremium("p-draft")).toMatchObject({ ok: false, error: { kind: "rejected" } });
  });

  it("files a yield claim below the threshold and confirms it into custody", async () => {
    const { contracts, store } = setup();
    await contracts.savePolicy("p-funded", policy);
    await contracts.payPremium("p-funded");
    const filed = await contracts.fileClaim("p-funded", { trigger: "yield", observedValue: 500, evidence: "Acta" });
    expect(filed.ok && filed.value).toMatchObject({ amount: 1_300_000, status: "pending" });
    if (!filed.ok) return;
    const confirmed = await contracts.confirmClaim("p-funded", filed.value.id);
    expect(confirmed.ok && confirmed.value.status).toBe("confirmed");
    expect((await contracts.listClaims("p-funded")).ok).toBe(true);
    expect(store.ledgerEntries.at(-1)).toMatchObject({ type: "CREDIT", category: "INDEMNITY", amount: 1_300_000 });
  });

  it("generates the contract and signs it until every party signed", async () => {
    const { contracts } = setup();
    expect((await contracts.generateContract("p-draft")).ok).toBe(false);
    await contracts.savePurchaseContract("p-draft", purchase);
    const generated = await contracts.generateContract("p-draft");
    expect(generated.ok && generated.value).toMatchObject({ version: 1, status: "pending_signatures" });
    if (!generated.ok) return;
    let doc = generated.value;
    while (doc.signableRoles.length > 0) {
      const signed = await contracts.sign(doc.id);
      if (!signed.ok) throw new Error("sign failed");
      doc = signed.value;
    }
    expect(doc.status).toBe("signed");
    expect(doc.parties.every((p) => p.signed)).toBe(true);
  });
});

describe("custody ledger with premium debits", () => {
  it("subtracts DEBITs from the balance and keeps the new categories", () => {
    const entry = (type: string, category: string, amount: number): LedgerEntryDto => ({ id: category, project_id: "p", type, category, amount, currency: "COP", negotiation_id: "", buyer_id: "", created_at: "2026-10-17T00:00:00Z" });
    const entries = toLedgerEntries([entry("CREDIT", "INVESTOR_CAPITAL", 1_000), entry("DEBIT", "PREMIUM", 150), entry("CREDIT", "INDEMNITY", 50), entry("WEIRD", "X", 999)]);
    expect(entries.map((e) => [e.type, e.category])).toEqual([
      ["CREDIT", "INVESTOR_CAPITAL"],
      ["DEBIT", "PREMIUM"],
      ["CREDIT", "INDEMNITY"],
      ["UNKNOWN", "UNKNOWN"],
    ]);
    expect(custodyBalance(entries)).toBe(900);
  });
});
