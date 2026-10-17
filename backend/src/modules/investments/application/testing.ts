// Test doubles for the investment specs: an in-memory store, a scripted capture and a fixed clock.
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import type { FundingCallback } from "../../milestones/ports/milestone-funding";
import { type Project, PROJECT_STATUS, type ProjectStatus } from "../../projects/application/project";
import type { CaptureQuote, Investment } from "../domain/investment";
import { type CaptureCompletion, type CaptureStart, InvestmentCapture, type InvestorWallet } from "../ports/investment-capture";
import { type CapitalCredit, InvestmentStore } from "../ports/investment-store";

const clone = <T>(value: T): T => structuredClone(value);

export const NOW = new Date("2026-10-17T12:00:00.000Z");

export const INVESTOR: AuthenticatedUser = { id: "u-inv", email: "inversionista@agro.dev", name: "Inversionista", role: "investor" };
export const OTHER_INVESTOR: AuthenticatedUser = { id: "u-inv-2", email: "otra@agro.dev", name: "Otra", role: "investor" };
export const OWNER: AuthenticatedUser = { id: "u-prod", email: "productor@agro.dev", name: "Productor", role: "seller" };
export const OTHER_SELLER: AuthenticatedUser = { id: "u-prod-2", email: "otro@agro.dev", name: "Otro", role: "seller" };
export const FIDU: AuthenticatedUser = { id: "u-fidu", email: "fidu@agro.dev", name: "Fidu", role: "fidu" };
export const BUYER: AuthenticatedUser = { id: "u-buyer", email: "comprador@agro.dev", name: "Comprador", role: "buyer" };

/** 1.000.000,00 COP target: the 10 % cap is 100.000 pesos per investor. */
export const sampleProject = (overrides: Partial<Project> = {}): Project => ({
  id: "p1",
  ownerUserId: OWNER.id,
  projectCode: "AGR-2026-001",
  title: "Café especial",
  productionType: "CAFE_ESPECIAL",
  description: "Ciclo de café",
  targetAmount: 100_000_000,
  custodyBalance: 0,
  totalDisbursed: 0,
  investorRoiPct: 0,
  platformFeePct: 3,
  currentStatus: PROJECT_STATUS.DRAFT,
  startDate: "2026-11-01",
  estimatedEndDate: "2027-05-01",
  currency: "COP",
  assetScale: 2,
  createdAt: NOW,
  ...overrides,
});

export class InMemoryInvestmentStore extends InvestmentStore {
  readonly projects = new Map<string, Project>();
  readonly investments = new Map<string, Investment>();
  readonly ledger: CapitalCredit[] = [];

  async findProject(id: string) {
    const found = this.projects.get(id);
    return found ? clone(found) : null;
  }
  async listProjects() {
    return [...this.projects.values()].map(clone);
  }
  async findById(id: string) {
    const found = this.investments.get(id);
    return found ? clone(found) : null;
  }
  async listByProject(projectId: string) {
    return [...this.investments.values()].filter((i) => i.projectId === projectId).map(clone);
  }
  async save(investment: Investment) {
    this.investments.set(investment.id, clone(investment));
  }
  async creditCapital(credit: CapitalCredit, amountMinor: number, status: ProjectStatus) {
    this.ledger.push(clone(credit));
    const project = this.projects.get(credit.projectId)!;
    this.projects.set(project.id, { ...project, custodyBalance: project.custodyBalance + amountMinor, currentStatus: status });
  }
  async transaction<T>(_projectId: string, work: (store: InvestmentStore) => Promise<T>): Promise<T> {
    return work(this);
  }
}

export const EUR_WALLET: InvestorWallet = { id: "https://ilp.test/inversionista_eur", assetCode: "EUR", assetScale: 2 };

/** 100.000 COP for 22,50 EUR: the rate is 40000/9. */
export const eurQuote = (overrides: Partial<CaptureQuote> = {}): CaptureQuote => ({
  id: "https://rs.inv.test/quotes/q-1",
  debitAmount: 2_250,
  debitAssetCode: "EUR",
  debitAssetScale: 2,
  receiveAmount: 10_000_000,
  expiresAt: "2026-10-17T12:05:00.000Z",
  ...overrides,
});

// Scripted: `mode` decides what start() answers; complete() answers `completion` or throws `completionError`.
export class FakeCapture extends InvestmentCapture {
  mode: "consent" | "captured" = "captured";
  wallets = new Map<string, InvestorWallet>([[EUR_WALLET.id, EUR_WALLET]]);
  startError: Error | null = null;
  completion: CaptureCompletion | null = null;
  completionError: Error | null = null;
  readonly started: string[] = [];
  readonly completed: { id: string; callback: FundingCallback }[] = [];

  async wallet(url: string) {
    const wallet = this.wallets.get(url);
    if (!wallet) throw new Error(`unknown wallet ${url}`);
    return wallet;
  }
  async start(investment: Investment): Promise<CaptureStart> {
    this.started.push(investment.id);
    if (this.startError) throw this.startError;
    const quote = eurQuote({ receiveAmount: investment.amount });
    if (this.mode === "captured") return { kind: "captured", quote, incomingPaymentId: null, outgoingPaymentId: `SIM-${investment.id}` };
    return { kind: "consent", redirectUrl: "https://wallet.test/consent", quote, incomingPaymentId: "https://rs.custody.test/incoming-payments/in-1" };
  }
  async complete(investment: Investment, callback: FundingCallback): Promise<CaptureCompletion> {
    this.completed.push({ id: investment.id, callback });
    if (this.completionError) throw this.completionError;
    return this.completion ?? { kind: "captured", quote: investment.quote!, outgoingPaymentId: "https://rs.inv.test/outgoing-payments/out-1" };
  }
}
