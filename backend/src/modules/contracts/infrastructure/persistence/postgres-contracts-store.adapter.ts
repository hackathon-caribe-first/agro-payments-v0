import { randomUUID } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";
import { RejectedError } from "../../../../shared/domain-errors";
import type { ContractDocument, ContractParty, ContractSignature, PartyRole } from "../../application/contract-document";
import type { ClaimStatus, ClaimTrigger, InsuranceClaim, InsurancePolicy, PolicySource, PolicyTerms, PremiumPayment } from "../../application/insurance";
import { BENEFICIARY } from "../../application/insurance";
import { PRICE_TYPE, type ContractCurrency, type ContractUnit, type PurchaseContract } from "../../application/purchase-contract";
import { ContractsStore, type CustodyEntry } from "../../ports/contracts-store";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v);
const date = (v: unknown) => new Date(v as string | Date);
const optDate = (v: unknown) => (v === null || v === undefined ? null : date(v));

const toPurchase = (r: Row): PurchaseContract => ({
  projectId: r.project_id as string,
  price:
    r.price_type === PRICE_TYPE.FIXED
      ? { type: PRICE_TYPE.FIXED, pricePerUnit: num(r.price_per_unit) }
      : { type: PRICE_TYPE.FORMULA, floorPerUnit: num(r.floor_per_unit), ceilingPerUnit: num(r.ceiling_per_unit), reference: r.price_reference as string },
  quantity: num(r.quantity),
  unit: r.unit as ContractUnit,
  currency: r.currency as ContractCurrency,
  buyerUserId: r.buyer_user_id as string,
  buyerWalletAddress: r.buyer_wallet_address as string,
  buyerWalletAssetCode: r.buyer_wallet_asset_code as string,
  buyerWalletAssetScale: num(r.buyer_wallet_asset_scale),
  updatedBy: r.updated_by as string,
  updatedAt: date(r.updated_at),
});

type StoredPayment = Omit<PremiumPayment, "requestedAt" | "completedAt"> & { requestedAt: string; completedAt: string | null };

const toPolicy = (r: Row): InsurancePolicy => {
  const payment = r.premium_payment as StoredPayment | null;
  return {
    projectId: r.project_id as string,
    insurerName: r.insurer_name as string,
    insurerWalletAddress: r.insurer_wallet_address as string,
    beneficiary: BENEFICIARY,
    source: r.source as PolicySource,
    simulationRunId: (r.simulation_run_id as string | null) ?? null,
    terms: r.terms as PolicyTerms,
    premiumPayment: payment ? { ...payment, requestedAt: date(payment.requestedAt), completedAt: optDate(payment.completedAt) } : null,
    updatedBy: r.updated_by as string,
    updatedAt: date(r.updated_at),
  };
};

const toSignature = (r: Row): ContractSignature => ({
  partyRole: r.party_role as PartyRole,
  userId: r.user_id as string,
  signedAt: date(r.signed_at),
  ip: (r.ip as string | null) ?? null,
  userAgent: (r.user_agent as string | null) ?? null,
  contractHash: r.contract_hash as string,
});

const toClaim = (r: Row): InsuranceClaim => ({
  id: r.id as string,
  projectId: r.project_id as string,
  trigger: r.trigger as ClaimTrigger,
  observedValue: num(r.observed_value),
  evidence: r.evidence as string,
  amount: num(r.amount),
  status: r.status as ClaimStatus,
  incomingPaymentUrl: (r.incoming_payment_url as string | null) ?? null,
  createdBy: r.created_by as string,
  createdAt: date(r.created_at),
  confirmedBy: (r.confirmed_by as string | null) ?? null,
  confirmedAt: optDate(r.confirmed_at),
});

// Plain SQL, no entities. Custody effects run in one transaction that first locks the project row, the same lock buyer deposits
// and investor captures take, so every custody movement on a project serializes.
export class PostgresContractsStore extends ContractsStore {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  private query(sql: string, params: unknown[] = [], manager: EntityManager = this.dataSource.manager): Promise<Row[]> {
    return manager.query(sql, params);
  }

  async findPurchaseContract(projectId: string) {
    const [row] = await this.query("SELECT * FROM purchase_contracts WHERE project_id = $1", [projectId]);
    return row ? toPurchase(row) : null;
  }

  async savePurchaseContract(c: PurchaseContract) {
    const fixed = c.price.type === PRICE_TYPE.FIXED ? c.price : null;
    const formula = c.price.type === PRICE_TYPE.FORMULA ? c.price : null;
    await this.query(
      `INSERT INTO purchase_contracts (project_id, price_type, price_per_unit, floor_per_unit, ceiling_per_unit, price_reference, quantity, unit, currency,
         buyer_user_id, buyer_wallet_address, buyer_wallet_asset_code, buyer_wallet_asset_scale, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (project_id) DO UPDATE SET price_type = $2, price_per_unit = $3, floor_per_unit = $4, ceiling_per_unit = $5, price_reference = $6,
         quantity = $7, unit = $8, currency = $9, buyer_user_id = $10, buyer_wallet_address = $11, buyer_wallet_asset_code = $12,
         buyer_wallet_asset_scale = $13, updated_by = $14, updated_at = $15`,
      [
        c.projectId,
        c.price.type,
        fixed?.pricePerUnit ?? null,
        formula?.floorPerUnit ?? null,
        formula?.ceilingPerUnit ?? null,
        formula?.reference ?? null,
        c.quantity,
        c.unit,
        c.currency,
        c.buyerUserId,
        c.buyerWalletAddress,
        c.buyerWalletAssetCode,
        c.buyerWalletAssetScale,
        c.updatedBy,
        c.updatedAt,
      ],
    );
  }

  async findPolicy(projectId: string) {
    const [row] = await this.query("SELECT * FROM insurance_policies WHERE project_id = $1", [projectId]);
    return row ? toPolicy(row) : null;
  }

  async savePolicy(p: InsurancePolicy, manager?: EntityManager) {
    await this.query(
      `INSERT INTO insurance_policies (project_id, insurer_name, insurer_wallet_address, beneficiary, source, simulation_run_id, terms, premium_payment, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (project_id) DO UPDATE SET insurer_name = $2, insurer_wallet_address = $3, beneficiary = $4, source = $5, simulation_run_id = $6,
         terms = $7, premium_payment = $8, updated_by = $9, updated_at = $10`,
      [
        p.projectId,
        p.insurerName,
        p.insurerWalletAddress,
        p.beneficiary,
        p.source,
        p.simulationRunId,
        JSON.stringify(p.terms),
        p.premiumPayment ? JSON.stringify(p.premiumPayment) : null,
        p.updatedBy,
        p.updatedAt,
      ],
      manager,
    );
  }

  private async withSignatures(row: Row | undefined): Promise<ContractDocument | null> {
    if (!row) return null;
    const signatures = await this.query("SELECT * FROM contract_signatures WHERE document_id = $1 ORDER BY seq", [row.id]);
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      version: num(row.version),
      body: row.body as string,
      hash: row.hash as string,
      parties: row.parties as ContractParty[],
      signatures: signatures.map(toSignature),
      createdBy: row.created_by as string,
      createdAt: date(row.created_at),
    };
  }

  async latestDocument(projectId: string) {
    const [row] = await this.query("SELECT * FROM contract_documents WHERE project_id = $1 ORDER BY version DESC LIMIT 1", [projectId]);
    return this.withSignatures(row);
  }

  async findDocument(id: string) {
    const [row] = await this.query("SELECT * FROM contract_documents WHERE id = $1", [id]);
    return this.withSignatures(row);
  }

  async insertDocument(d: ContractDocument) {
    await this.query(
      `INSERT INTO contract_documents (id, project_id, version, body, hash, parties, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [d.id, d.projectId, d.version, d.body, d.hash, JSON.stringify(d.parties), d.createdBy, d.createdAt],
    );
  }

  async addSignatures(documentId: string, signatures: ContractSignature[]) {
    await this.dataSource.transaction(async (manager) => {
      for (const s of signatures) {
        await this.query(
          `INSERT INTO contract_signatures (document_id, party_role, user_id, signed_at, ip, user_agent, contract_hash) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [documentId, s.partyRole, s.userId, s.signedAt, s.ip, s.userAgent, s.contractHash],
          manager,
        );
      }
    });
  }

  async capturedInvestors(projectId: string) {
    const rows = await this.query(
      `SELECT investor_user_id, SUM(amount) AS capital FROM investments WHERE project_id = $1 AND status = 'CAPTURED'
       GROUP BY investor_user_id ORDER BY MIN(seq)`,
      [projectId],
    );
    return rows.map((r) => ({ userId: r.investor_user_id as string, capital: num(r.capital) }));
  }

  async listClaims(projectId: string) {
    return (await this.query("SELECT * FROM insurance_claims WHERE project_id = $1 ORDER BY seq", [projectId])).map(toClaim);
  }

  async findClaim(id: string) {
    const [row] = await this.query("SELECT * FROM insurance_claims WHERE id = $1", [id]);
    return row ? toClaim(row) : null;
  }

  async saveClaim(c: InsuranceClaim, manager?: EntityManager) {
    await this.query(
      `INSERT INTO insurance_claims (id, project_id, trigger, observed_value, evidence, amount, status, incoming_payment_url, created_by, created_at, confirmed_by, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET status = $7, incoming_payment_url = $8, confirmed_by = $11, confirmed_at = $12`,
      [c.id, c.projectId, c.trigger, c.observedValue, c.evidence, c.amount, c.status, c.incomingPaymentUrl, c.createdBy, c.createdAt, c.confirmedBy, c.confirmedAt],
      manager,
    );
  }

  /** The ledger books whole pesos (like buyer deposits and captures); custody_balance stays in minor units. */
  private async book(manager: EntityManager, type: "CREDIT" | "DEBIT", category: "PREMIUM" | "INDEMNITY", e: CustodyEntry) {
    const [project] = await this.query("SELECT custody_balance FROM projects WHERE id = $1 FOR UPDATE", [e.projectId], manager);
    if (!project) throw new RejectedError("El proyecto no existe.");
    if (type === "DEBIT" && num(project.custody_balance) < e.amount) throw new RejectedError("La custodia no tiene saldo para pagar la prima.");
    await this.query(
      `INSERT INTO ledger_entries (id, project_id, type, category, amount, currency, reference_id, payment_reference, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), e.projectId, type, category, Math.round(e.amount / 10 ** e.assetScale), e.currency, e.id, e.reference, e.at],
      manager,
    );
    await this.query("UPDATE projects SET custody_balance = custody_balance + $1 WHERE id = $2", [type === "DEBIT" ? -e.amount : e.amount, e.projectId], manager);
  }

  async bookPremium(policy: InsurancePolicy, entry: CustodyEntry) {
    await this.dataSource.transaction(async (manager) => {
      await this.book(manager, "DEBIT", "PREMIUM", entry);
      await this.savePolicy(policy, manager);
    });
  }

  async bookIndemnity(claim: InsuranceClaim, entry: CustodyEntry) {
    await this.dataSource.transaction(async (manager) => {
      await this.book(manager, "CREDIT", "INDEMNITY", entry);
      await this.saveClaim(claim, manager);
    });
  }
}
