import type { DataSource, EntityManager } from "typeorm";
import type { ProjectStatus } from "../../../projects/application/project";
import { ProjectEntity } from "../../../projects/infrastructure/persistence/project.entity";
import { toProject } from "../../../projects/infrastructure/persistence/typeorm-project.adapter";
import type { Harvest, HarvestPrice, HarvestStatus } from "../../domain/harvest";
import { type HarvestCredit, HarvestStore } from "../../ports/harvest-store";

// Plain SQL over the harvest migration's table, the custody ledger and the project row (like TypeOrmNegotiationStore).
// node-pg returns bigint as string and timestamptz as Date; both are normalized here.
type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const date = (v: unknown) => (v === null || v === undefined ? null : (v as Date));

const toHarvest = (r: Row): Harvest => ({
  projectId: r.project_id as string,
  status: r.status as HarvestStatus,
  declaredQuantityKg: Number(r.declared_quantity_kg),
  declaredQuality: r.declared_quality as string,
  evidence: r.evidence as string,
  declaredBy: r.declared_by as string,
  declaredAt: r.declared_at as Date,
  certifiedQuantityKg: num(r.certified_quantity_kg),
  certifiedQuality: r.certified_quality as string | null,
  certificationNotes: r.certification_notes as string | null,
  certifiedBy: r.certified_by as string | null,
  certifiedAt: date(r.certified_at),
  price: r.price as HarvestPrice | null,
  amountDue: num(r.amount_due),
  currency: r.currency as string,
  assetScale: r.asset_scale as number,
  buyerUserId: r.buyer_user_id as string | null,
  paymentReference: r.payment_reference as string | null,
  paidAt: date(r.paid_at),
  receivedAt: date(r.received_at),
});

export class TypeOrmHarvestStore extends HarvestStore {
  constructor(
    private readonly dataSource: DataSource,
    private readonly manager: EntityManager = dataSource.manager,
  ) {
    super();
  }

  private query = (sql: string, params: unknown[] = []): Promise<Row[]> => this.manager.query(sql, params);

  async findProject(id: string) {
    const row = await this.manager.getRepository(ProjectEntity).findOneBy({ id });
    return row ? toProject(row) : null;
  }

  async findHarvest(projectId: string) {
    const [row] = await this.query("SELECT * FROM harvests WHERE project_id = $1", [projectId]);
    return row ? toHarvest(row) : null;
  }

  async listHarvests() {
    return (await this.query("SELECT * FROM harvests ORDER BY declared_at, project_id")).map(toHarvest);
  }

  async saveHarvest(h: Harvest) {
    await this.query(
      `INSERT INTO harvests (project_id, status, declared_quantity_kg, declared_quality, evidence, declared_by, declared_at, certified_quantity_kg,
         certified_quality, certification_notes, certified_by, certified_at, price, amount_due, currency, asset_scale, buyer_user_id,
         payment_reference, paid_at, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (project_id) DO UPDATE SET status = EXCLUDED.status, certified_quantity_kg = EXCLUDED.certified_quantity_kg,
         certified_quality = EXCLUDED.certified_quality, certification_notes = EXCLUDED.certification_notes, certified_by = EXCLUDED.certified_by,
         certified_at = EXCLUDED.certified_at, price = EXCLUDED.price, amount_due = EXCLUDED.amount_due, buyer_user_id = EXCLUDED.buyer_user_id,
         payment_reference = EXCLUDED.payment_reference, paid_at = EXCLUDED.paid_at, received_at = EXCLUDED.received_at`,
      [
        h.projectId,
        h.status,
        h.declaredQuantityKg,
        h.declaredQuality,
        h.evidence,
        h.declaredBy,
        h.declaredAt,
        h.certifiedQuantityKg,
        h.certifiedQuality,
        h.certificationNotes,
        h.certifiedBy,
        h.certifiedAt,
        h.price === null ? null : JSON.stringify(h.price),
        h.amountDue,
        h.currency,
        h.assetScale,
        h.buyerUserId,
        h.paymentReference,
        h.paidAt,
        h.receivedAt,
      ],
    );
  }

  async setProjectStatus(projectId: string, status: ProjectStatus) {
    await this.query("UPDATE projects SET current_status = $1 WHERE id = $2", [status, projectId]);
  }

  async creditHarvest(c: HarvestCredit, amountMinor: number) {
    await this.query(
      `INSERT INTO ledger_entries (id, project_id, type, category, amount, currency, buyer_user_id, payment_reference, created_at)
       VALUES ($1, $2, 'CREDIT', 'HARVEST_PAYMENT', $3, $4, $5, $6, $7)`,
      [c.id, c.projectId, c.amount, c.currency, c.buyerUserId, c.paymentReference, c.createdAt],
    );
    await this.query("UPDATE projects SET custody_balance = custody_balance + $1 WHERE id = $2", [amountMinor, c.projectId]);
  }

  async creditsByCategory(projectId: string) {
    return this.byCategory(projectId, "CREDIT");
  }

  async debitsByCategory(projectId: string) {
    return this.byCategory(projectId, "DEBIT");
  }

  private async byCategory(projectId: string, type: "CREDIT" | "DEBIT") {
    const rows = await this.query(
      `SELECT l.category, SUM(l.amount) AS total, p.asset_scale FROM ledger_entries l JOIN projects p ON p.id = l.project_id
       WHERE l.project_id = $1 AND l.type = $2 GROUP BY l.category, p.asset_scale ORDER BY MIN(l.seq)`,
      [projectId, type],
    );
    // The ledger holds whole pesos; the statement is in the project's minor units.
    return Object.fromEntries(rows.map((r) => [r.category as string, Number(r.total) * 10 ** Number(r.asset_scale)]));
  }

  // Same lock as the negotiation and investment stores, so deposits, captures and the harvest payment serialize per project.
  transaction<T>(projectId: string, work: (store: HarvestStore) => Promise<T>): Promise<T> {
    const run = async (store: TypeOrmHarvestStore) => {
      await store.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [projectId]);
      return work(store);
    };
    if (this.manager.queryRunner?.isTransactionActive) return run(this);
    return this.dataSource.transaction((manager) => run(new TypeOrmHarvestStore(this.dataSource, manager)));
  }
}
