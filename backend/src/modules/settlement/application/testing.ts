// Test doubles shared by the settlement specs.
import { SettlementRepository } from "../ports/settlement.repository";
import { createSettlement, type PartyWallets, type Settlement, type SettlementTerms } from "./settlement";

export const WALLETS: PartyWallets = { producer: "https://wallet.test/productor", platform: "https://wallet.test/plataforma" };

/** L = 200 M, debt 10 M, V_prod 20 M, one COP and one EUR investor (60 / 40 M), one year: every tier is paid and E = 58 M. */
export const sampleTerms = (overrides: Partial<SettlementTerms> = {}): SettlementTerms => ({
  proceeds: 200_000_000,
  integratorDebt: 10_000_000,
  integratorWalletAddress: "https://wallet.test/integrador",
  producerContribution: 20_000_000,
  days: 365,
  investors: [
    { id: "inv-cop", capital: 60_000_000, currency: "COP", walletAddress: "https://wallet.test/inversionista-cop" },
    { id: "inv-eur", capital: 40_000_000, currency: "EUR", walletAddress: "https://wallet.test/inversionista-eur" },
  ],
  ...overrides,
});

export const sampleSettlement = (overrides: Partial<SettlementTerms> = {}): Settlement =>
  createSettlement({
    id: "s1",
    projectId: "p1",
    terms: sampleTerms(overrides),
    wallets: WALLETS,
    currency: "COP",
    assetScale: 2,
    createdBy: "u-admin",
    now: new Date("2026-10-17T10:00:00Z"),
  });

export class FakeSettlementRepository extends SettlementRepository {
  private readonly rows = new Map<string, Settlement>();
  async save(settlement: Settlement) {
    this.rows.set(settlement.id, structuredClone(settlement));
  }
  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : null;
  }
  async findByProject(projectId: string) {
    return [...this.rows.values()].filter((s) => s.projectId === projectId).map((s) => structuredClone(s));
  }
}
