import type { DataSource, EntityManager } from "typeorm";
import type { ProjectStatus } from "../../../projects/application/project";
import { ProjectEntity } from "../../../projects/infrastructure/persistence/project.entity";
import { toProject } from "../../../projects/infrastructure/persistence/typeorm-project.adapter";
import type { Investment, InvestmentStatus } from "../../domain/investment";
import { type CapitalCredit, InvestmentStore } from "../../ports/investment-store";

// Plain SQL over the migration's tables, like TypeOrmNegotiationStore. node-pg returns bigint as string: amounts are parsed
// back and must be safe integers.
type Row = Record<string, unknown>;

const int = (v: unknown) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`Stored amount ${String(v)} is not a safe integer`);
  return n;
};
const date = (v: unknown) => (v === null ? null : (v as Date));

const toInvestment = (r: Row): Investment => ({
  id: r.id as string,
  projectId: r.project_id as string,
  investorUserId: r.investor_user_id as string,
  walletAddress: r.wallet_address as string,
  status: r.status as InvestmentStatus,
  failureReason: r.failure_reason as string | null,
  amount: int(r.amount),
  currency: r.currency as string,
  assetScale: r.asset_scale as number,
  quote:
    r.quote_id === null
      ? null
      : {
          id: r.quote_id as string,
          debitAmount: int(r.debit_amount),
          debitAssetCode: r.debit_asset_code as string,
          debitAssetScale: r.debit_asset_scale as number,
          receiveAmount: int(r.receive_amount),
          expiresAt: r.quote_expires_at === null ? null : (r.quote_expires_at as Date).toISOString(),
        },
  impliedRate: r.implied_rate as string | null,
  incomingPaymentId: r.incoming_payment_id as string | null,
  outgoingPaymentId: r.outgoing_payment_id as string | null,
  createdAt: r.created_at as Date,
  capturedAt: date(r.captured_at),
});

export class TypeOrmInvestmentStore extends InvestmentStore {
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

  async listProjects() {
    return (await this.manager.getRepository(ProjectEntity).find({ order: { seq: "ASC" } })).map(toProject);
  }

  async findById(id: string) {
    const [row] = await this.query("SELECT * FROM investments WHERE id = $1", [id]);
    return row ? toInvestment(row) : null;
  }

  async listByProject(projectId: string) {
    return (await this.query("SELECT * FROM investments WHERE project_id = $1 ORDER BY seq", [projectId])).map(toInvestment);
  }

  async save(i: Investment) {
    const q = i.quote;
    await this.query(
      `INSERT INTO investments (id, project_id, investor_user_id, wallet_address, status, failure_reason, amount, currency, asset_scale, quote_id,
         debit_amount, debit_asset_code, debit_asset_scale, receive_amount, quote_expires_at, implied_rate, incoming_payment_id, outgoing_payment_id,
         created_at, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, failure_reason = EXCLUDED.failure_reason, quote_id = EXCLUDED.quote_id,
         debit_amount = EXCLUDED.debit_amount, debit_asset_code = EXCLUDED.debit_asset_code, debit_asset_scale = EXCLUDED.debit_asset_scale,
         receive_amount = EXCLUDED.receive_amount, quote_expires_at = EXCLUDED.quote_expires_at, implied_rate = EXCLUDED.implied_rate,
         incoming_payment_id = EXCLUDED.incoming_payment_id, outgoing_payment_id = EXCLUDED.outgoing_payment_id, captured_at = EXCLUDED.captured_at`,
      [
        i.id,
        i.projectId,
        i.investorUserId,
        i.walletAddress,
        i.status,
        i.failureReason,
        i.amount,
        i.currency,
        i.assetScale,
        q?.id ?? null,
        q?.debitAmount ?? null,
        q?.debitAssetCode ?? null,
        q?.debitAssetScale ?? null,
        q?.receiveAmount ?? null,
        q?.expiresAt ?? null,
        i.impliedRate,
        i.incomingPaymentId,
        i.outgoingPaymentId,
        i.createdAt,
        i.capturedAt,
      ],
    );
  }

  async creditCapital(c: CapitalCredit, amountMinor: number, status: ProjectStatus) {
    await this.query(
      `INSERT INTO ledger_entries (id, project_id, type, category, amount, currency, investment_id, payment_reference, created_at)
       VALUES ($1, $2, 'CREDIT', 'INVESTOR_CAPITAL', $3, $4, $5, $6, $7)`,
      [c.id, c.projectId, c.amount, c.currency, c.investmentId, c.paymentReference, c.createdAt],
    );
    await this.query("UPDATE projects SET custody_balance = custody_balance + $1, current_status = $2 WHERE id = $3", [amountMinor, status, c.projectId]);
  }

  // Same lock as TypeOrmNegotiationStore.transaction, so captures and buyer deposits on one project serialize together.
  transaction<T>(projectId: string, work: (store: InvestmentStore) => Promise<T>): Promise<T> {
    const run = async (store: TypeOrmInvestmentStore) => {
      await store.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [projectId]);
      return work(store);
    };
    if (this.manager.queryRunner?.isTransactionActive) return run(this);
    return this.dataSource.transaction((manager) => run(new TypeOrmInvestmentStore(this.dataSource, manager)));
  }
}
