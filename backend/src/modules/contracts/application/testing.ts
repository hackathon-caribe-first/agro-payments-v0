// Test doubles and fixtures shared by the contracts specs.
import { RejectedError } from "../../../shared/domain-errors";
import type { FundingCallback } from "../../milestones/ports/milestone-funding";
import type { WalletInfo } from "../../payouts/ports/wallet-directory";
import { WalletDirectory } from "../../payouts/ports/wallet-directory";
import type { Viewer } from "../../projects/application/project";
import type { ProjectRepository } from "../../projects/ports/project.repository";
import { type CustodyEntry, ContractsStore } from "../ports/contracts-store";
import { IndemnityInflow, type IndemnityOrder } from "../ports/indemnity-inflow";
import { PremiumFunding, type PremiumOrder } from "../ports/premium-funding";
import type { ContractContext, ContractDocument, ContractSignature } from "./contract-document";
import { BENEFICIARY, POLICY_SOURCE, type InsuranceClaim, type InsurancePolicy } from "./insurance";
import { PRICE_TYPE, type PurchaseContract } from "./purchase-contract";

export const OWNER: Viewer = { id: "u-prod", role: "seller" };
export const FIDU: Viewer = { id: "u-fidu", role: "fidu" };
export const ADMIN: Viewer = { id: "u-admin", role: "admin" };
export const BUYER_USER: Viewer = { id: "u-buyer", role: "buyer" };
export const INVESTOR_A: Viewer = { id: "u-inv-a", role: "investor" };
export const INVESTOR_B: Viewer = { id: "u-inv-b", role: "investor" };

export const purchaseContract = (overrides: Partial<PurchaseContract> = {}): PurchaseContract => ({
  projectId: "p1",
  price: { type: PRICE_TYPE.FIXED, pricePerUnit: 130_000 },
  quantity: 85_000,
  unit: "kg",
  currency: "COP",
  buyerUserId: BUYER_USER.id,
  buyerWalletAddress: "https://wallet.test/comprador",
  buyerWalletAssetCode: "COP",
  buyerWalletAssetScale: 2,
  updatedBy: OWNER.id,
  updatedAt: new Date("2026-10-17T10:00:00Z"),
  ...overrides,
});

export const insurancePolicy = (overrides: Partial<InsurancePolicy> = {}): InsurancePolicy => ({
  projectId: "p1",
  insurerName: "Aseguradora Demo",
  insurerWalletAddress: "https://wallet.test/aseguradora",
  beneficiary: BENEFICIARY,
  source: POLICY_SOURCE.INPUT,
  simulationRunId: null,
  terms: {
    hectares: 10,
    expectedYieldKgPerHa: 1_000,
    shrinkagePct: 0,
    insuredPricePerKg: 100_000,
    thresholdPct: 70,
    deductiblePct: 10,
    grossPremium: 426_972_000,
    subsidyPct: 85,
    netPremium: 64_045_800,
    indexTrigger: 100,
    indexExit: 50,
  },
  premiumPayment: null,
  updatedBy: OWNER.id,
  updatedAt: new Date("2026-10-17T10:00:00Z"),
  ...overrides,
});

export const contractContext = (): ContractContext => ({
  project: {
    id: "p1",
    projectCode: "AGR-2026-001",
    title: "Tomate bajo invernadero",
    startDate: "2026-11-01",
    estimatedEndDate: "2027-03-01",
    currency: "COP",
    ownerUserId: OWNER.id,
  },
  milestones: [
    { sequenceOrder: 1, title: "Siembra", amount: 309_000_000, estimatedCompletionDate: "2026-12-01" },
    { sequenceOrder: 2, title: "Cosecha", amount: 103_000_000, estimatedCompletionDate: "2027-02-01" },
  ],
  purchase: purchaseContract(),
  policy: insurancePolicy(),
  producerName: "Pedro Productor",
  buyerName: "Comercializadora Andina",
  investors: [
    { userId: INVESTOR_A.id, name: "Ana Inversionista", capital: 3_000_000 },
    { userId: INVESTOR_B.id, name: "Beto Inversionista", capital: 2_000_000 },
  ],
});

type LedgerRow = { type: "CREDIT" | "DEBIT"; category: "PREMIUM" | "INDEMNITY"; projectId: string; amount: number; reference: string | null };

// Copies on the way in and out, like a database would. Custody effects move the fake project's balance like the SQL does.
export class FakeContractsStore extends ContractsStore {
  readonly purchases = new Map<string, PurchaseContract>();
  readonly policies = new Map<string, InsurancePolicy>();
  readonly documents: ContractDocument[] = [];
  readonly claims = new Map<string, InsuranceClaim>();
  readonly ledger: LedgerRow[] = [];
  investors: { userId: string; capital: number }[] = [];

  constructor(private readonly projects: ProjectRepository) {
    super();
  }
  async findPurchaseContract(projectId: string) {
    return structuredClone(this.purchases.get(projectId) ?? null);
  }
  async savePurchaseContract(c: PurchaseContract) {
    this.purchases.set(c.projectId, structuredClone(c));
  }
  async findPolicy(projectId: string) {
    return structuredClone(this.policies.get(projectId) ?? null);
  }
  async savePolicy(p: InsurancePolicy) {
    this.policies.set(p.projectId, structuredClone(p));
  }
  async latestDocument(projectId: string) {
    return structuredClone(this.documents.filter((d) => d.projectId === projectId).sort((a, b) => a.version - b.version).at(-1) ?? null);
  }
  async findDocument(id: string) {
    return structuredClone(this.documents.find((d) => d.id === id) ?? null);
  }
  async insertDocument(d: ContractDocument) {
    this.documents.push(structuredClone(d));
  }
  async addSignatures(documentId: string, signatures: ContractSignature[]) {
    const doc = this.documents.find((d) => d.id === documentId);
    if (!doc) throw new Error(`no document ${documentId}`);
    doc.signatures.push(...structuredClone(signatures));
  }
  async capturedInvestors() {
    return structuredClone(this.investors);
  }
  async listClaims(projectId: string) {
    return structuredClone([...this.claims.values()].filter((c) => c.projectId === projectId));
  }
  async findClaim(id: string) {
    return structuredClone(this.claims.get(id) ?? null);
  }
  async saveClaim(c: InsuranceClaim) {
    this.claims.set(c.id, structuredClone(c));
  }
  async bookPremium(policy: InsurancePolicy, entry: CustodyEntry) {
    const project = await this.projects.findById(entry.projectId);
    if (!project || project.custodyBalance < entry.amount) throw new RejectedError("La custodia no tiene saldo para pagar la prima.");
    project.custodyBalance -= entry.amount;
    this.ledger.push({ type: "DEBIT", category: "PREMIUM", projectId: entry.projectId, amount: entry.amount, reference: entry.reference });
    await this.savePolicy(policy);
  }
  async bookIndemnity(claim: InsuranceClaim, entry: CustodyEntry) {
    const project = await this.projects.findById(entry.projectId);
    if (!project) throw new Error("no project");
    project.custodyBalance += entry.amount;
    this.ledger.push({ type: "CREDIT", category: "INDEMNITY", projectId: entry.projectId, amount: entry.amount, reference: entry.reference });
    await this.saveClaim(claim);
  }
}

/** interactive=false behaves like simulated mode; interactive=true needs approve() before ready(). */
export class FakePremiumFunding extends PremiumFunding {
  readonly started: PremiumOrder[] = [];
  readonly revoked: string[] = [];
  private readonly active = new Set<string>();
  constructor(readonly interactive = false) {
    super();
  }
  async start(order: PremiumOrder) {
    this.started.push(order);
    return { redirectUrl: `https://wallet.test/consent/premium/${order.projectId}` };
  }
  async complete(projectId: string, _params: FundingCallback) {
    this.active.add(projectId);
  }
  async ready(projectId: string) {
    return !this.interactive || this.active.has(projectId);
  }
  async revoke(projectId: string) {
    this.revoked.push(projectId);
  }
}

/** url=null behaves like simulated mode; otherwise every claim gets an incoming payment that has received `paid`. */
export class FakeIndemnityInflow extends IndemnityInflow {
  readonly orders: IndemnityOrder[] = [];
  paid = 0;
  constructor(private readonly url: string | null = null) {
    super();
  }
  async request(order: IndemnityOrder) {
    this.orders.push(order);
    return this.url;
  }
  async received() {
    return this.paid;
  }
}

/** Resolves every https wallet in COP/2 except those containing "missing". */
export class FakeWalletDirectory extends WalletDirectory {
  async lookup(walletAddress: string): Promise<WalletInfo | null> {
    return walletAddress.includes("missing") ? null : { id: walletAddress, assetCode: "COP", assetScale: 2 };
  }
}
