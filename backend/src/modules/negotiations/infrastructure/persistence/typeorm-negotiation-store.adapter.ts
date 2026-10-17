import type { DataSource, EntityManager } from "typeorm";
import { PROJECT_STATUS } from "../../../projects/application/project";
import { ProjectEntity } from "../../../projects/infrastructure/persistence/project.entity";
import { toProject } from "../../../projects/infrastructure/persistence/typeorm-project.adapter";
import type { HistoryEntryDto, SaleQuoteDto } from "../../domain/wire";
import {
  type LedgerRecord,
  type NegotiationFilter,
  type NegotiationRecord,
  NegotiationStore,
  type OpenRequestFilter,
  type OpenRequestRecord,
} from "../../ports/negotiation-store";

// Plain SQL over the migration's tables (no entities: the rows mirror the wire shape one to one).
// node-pg returns bigint as string and timestamptz as Date; both are normalized here, and optional wire keys are left out
// when null because the web app's schema accepts them absent, not null.
type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v);
const iso = (v: unknown) => (v as Date).toISOString();
const opt = <K extends string, V>(key: K, value: V | null | undefined) => (value === null || value === undefined ? {} : ({ [key]: value } as Record<K, V>));

const toQuote = (r: Row): SaleQuoteDto => ({
  request_id: r.request_id as string,
  revision: r.revision as number,
  author: r.author as string,
  unit_price: num(r.unit_price),
  quantity: num(r.quantity),
  currency: r.currency as string,
  ...opt("unit", r.unit as string | null),
  ...opt("notes", r.notes as string | null),
  ...opt("delivery_date", r.delivery_date as string | null),
  ...opt("valid_until", r.valid_until as string | null),
  ...opt("delivery_terms", r.delivery_terms as string | null),
  status: r.status as string,
  created_at: iso(r.created_at),
});

const toHistory = (r: Row): HistoryEntryDto => ({
  id: r.id as string,
  actor: r.actor as string,
  type: r.type as string,
  from: r.from_status as string | null,
  to: r.to_status as string | null,
  at: iso(r.at),
  ...opt("payload", r.payload as Record<string, unknown> | null),
});

const toNegotiation = (r: Row, quotes: SaleQuoteDto[], history: HistoryEntryDto[]): NegotiationRecord => ({
  id: r.id as string,
  origin: r.origin as string,
  ...opt("open_request_id", r.open_request_id as string | null),
  ...opt("scope", r.scope as string | null),
  ...opt("milestone_id", r.milestone_id as string | null),
  project_id: r.project_id as string,
  ...opt("producer_id", r.producer_user_id as string | null),
  producer_name: r.producer_name as string,
  buyer_id: r.buyer_user_id as string,
  buyer_name: r.buyer_name as string,
  quantity: num(r.quantity),
  desired_delivery_date: r.desired_delivery_date as string,
  notes: r.notes as string,
  status: r.status as string,
  created_at: iso(r.created_at),
  quotes,
  history,
  ...opt("agreed_total", r.agreed_total === null ? null : num(r.agreed_total)),
  ...opt("deposit_status", r.deposit_status as string | null),
  ...opt("deposited_at", r.deposited_at === null ? null : iso(r.deposited_at)),
  ...opt("ledger_entry_id", r.ledger_entry_id as string | null),
});

const toOpenRequest = (r: Row): OpenRequestRecord => ({
  id: r.id as string,
  buyer_id: r.buyer_user_id as string,
  buyer_name: r.buyer_name as string,
  title: r.title as string,
  production_type: r.production_type as string,
  quantity: num(r.quantity),
  unit: r.unit as string,
  ...opt("target_unit_price", r.target_unit_price === null ? null : num(r.target_unit_price)),
  currency: r.currency as string,
  delivery_date: r.delivery_date as string,
  delivery_location: r.delivery_location as string,
  notes: r.notes as string,
  status: r.status as string,
  created_at: iso(r.created_at),
});

const toLedger = (r: Row): LedgerRecord => ({
  id: r.id as string,
  project_id: r.project_id as string,
  type: r.type as string,
  category: r.category as string,
  amount: num(r.amount),
  currency: r.currency as string,
  ...opt("negotiation_id", r.negotiation_id as string | null),
  ...opt("buyer_id", r.buyer_user_id as string | null),
  ...opt("investment_id", r.investment_id as string | null),
  created_at: iso(r.created_at),
  payment_reference: r.payment_reference as string | null,
});

export class TypeOrmNegotiationStore extends NegotiationStore {
  constructor(
    private readonly dataSource: DataSource,
    private readonly manager: EntityManager = dataSource.manager,
  ) {
    super();
  }

  private query = (sql: string, params: unknown[] = []): Promise<Row[]> => this.manager.query(sql, params);

  async findNegotiation(id: string) {
    const [found] = await this.withChildren(await this.query("SELECT * FROM quote_requests WHERE id = $1", [id]));
    return found ?? null;
  }

  async listNegotiations(f: NegotiationFilter) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, value: string | undefined) => {
      if (value === undefined) return;
      params.push(value);
      where.push(`${column} = $${params.length}`);
    };
    add("project_id", f.projectId);
    add("buyer_user_id", f.buyerId);
    add("producer_user_id", f.producerId);
    add("open_request_id", f.openRequestId);
    const rows = await this.query(`SELECT * FROM quote_requests ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY seq`, params);
    return this.withChildren(rows);
  }

  private async withChildren(rows: Row[]): Promise<NegotiationRecord[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const quotes = await this.query("SELECT * FROM quotes WHERE request_id = ANY($1) ORDER BY revision", [ids]);
    const history = await this.query("SELECT * FROM negotiation_history WHERE request_id = ANY($1) ORDER BY position", [ids]);
    return rows.map((r) =>
      toNegotiation(
        r,
        quotes.filter((q) => q.request_id === r.id).map(toQuote),
        history.filter((h) => h.request_id === r.id).map(toHistory),
      ),
    );
  }

  saveNegotiation(n: NegotiationRecord) {
    return this.inTransaction(async (store) => {
      await store.query(
        `INSERT INTO quote_requests (id, origin, open_request_id, scope, milestone_id, project_id, producer_user_id, producer_name, buyer_user_id,
           buyer_name, quantity, desired_delivery_date, notes, status, created_at, agreed_total, deposit_status, deposited_at, ledger_entry_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, notes = EXCLUDED.notes, status = EXCLUDED.status,
           agreed_total = EXCLUDED.agreed_total, deposit_status = EXCLUDED.deposit_status, deposited_at = EXCLUDED.deposited_at,
           ledger_entry_id = EXCLUDED.ledger_entry_id`,
        [
          n.id,
          n.origin ?? "PROJECT_INTEREST",
          n.open_request_id ?? null,
          n.scope ?? null,
          n.milestone_id ?? null,
          n.project_id,
          n.producer_id ?? null,
          n.producer_name ?? "",
          n.buyer_id,
          n.buyer_name,
          n.quantity,
          n.desired_delivery_date,
          n.notes,
          n.status,
          n.created_at,
          n.agreed_total ?? null,
          n.deposit_status ?? null,
          n.deposited_at ?? null,
          n.ledger_entry_id ?? null,
        ],
      );
      // Offers are immutable but for their status.
      for (const q of n.quotes) {
        await store.query(
          `INSERT INTO quotes (request_id, revision, author, unit_price, quantity, currency, unit, notes, delivery_date, valid_until, delivery_terms, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (request_id, revision) DO UPDATE SET status = EXCLUDED.status`,
          [q.request_id, q.revision, q.author ?? "PRODUCER", q.unit_price, q.quantity, q.currency, q.unit ?? null, q.notes ?? null, q.delivery_date ?? null, q.valid_until ?? null, q.delivery_terms ?? null, q.status, q.created_at],
        );
      }
      // Append-only: an entry that exists is never rewritten.
      for (const [position, h] of n.history.entries()) {
        await store.query(
          `INSERT INTO negotiation_history (request_id, id, position, actor, type, from_status, to_status, at, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (request_id, id) DO NOTHING`,
          [n.id, h.id, position, h.actor, h.type, h.from, h.to, h.at, h.payload === undefined ? null : JSON.stringify(h.payload)],
        );
      }
    });
  }

  async findOpenRequest(id: string) {
    const [row] = await this.query("SELECT * FROM open_requests WHERE id = $1", [id]);
    return row ? toOpenRequest(row) : null;
  }

  async listOpenRequests(f: OpenRequestFilter) {
    const rows = await this.query(
      "SELECT * FROM open_requests WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR buyer_user_id = $2) ORDER BY seq",
      [f.status ?? null, f.buyerId ?? null],
    );
    return rows.map(toOpenRequest);
  }

  async saveOpenRequest(o: OpenRequestRecord) {
    await this.query(
      `INSERT INTO open_requests (id, buyer_user_id, buyer_name, title, production_type, quantity, unit, target_unit_price, currency, delivery_date,
         delivery_location, notes, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
      [o.id, o.buyer_id, o.buyer_name, o.title, o.production_type, o.quantity, o.unit, o.target_unit_price ?? null, o.currency, o.delivery_date, o.delivery_location, o.notes, o.status, o.created_at],
    );
  }

  async findProject(id: string) {
    const row = await this.manager.getRepository(ProjectEntity).findOneBy({ id });
    return row ? toProject(row) : null;
  }

  async listProjects() {
    return (await this.manager.getRepository(ProjectEntity).find({ order: { seq: "ASC" } })).map(toProject);
  }

  async listLedger(projectId: string) {
    return (await this.query("SELECT * FROM ledger_entries WHERE project_id = $1 ORDER BY seq", [projectId])).map(toLedger);
  }

  async addLedgerEntry(e: LedgerRecord) {
    await this.query(
      `INSERT INTO ledger_entries (id, project_id, type, category, amount, currency, negotiation_id, buyer_user_id, payment_reference, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [e.id, e.project_id, e.type, e.category, e.amount, e.currency, e.negotiation_id ?? null, e.buyer_id ?? null, e.payment_reference, e.created_at],
    );
  }

  async creditCustody(projectId: string, amountMinor: number) {
    await this.query("UPDATE projects SET custody_balance = custody_balance + $1, current_status = $2 WHERE id = $3", [
      amountMinor,
      PROJECT_STATUS.FUNDED_IN_CUSTODY,
      projectId,
    ]);
  }

  // Locking the project row serializes every negotiation write on that project (accept + auto-close, deposit) across requests.
  transaction<T>(projectId: string, work: (store: NegotiationStore) => Promise<T>): Promise<T> {
    return this.inTransaction(async (store): Promise<T> => {
      await store.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [projectId]);
      return work(store);
    });
  }

  // Nested calls reuse the open transaction.
  private inTransaction<T>(work: (store: TypeOrmNegotiationStore) => Promise<T>): Promise<T> {
    if (this.manager.queryRunner?.isTransactionActive) return work(this);
    return this.dataSource.transaction((manager) => work(new TypeOrmNegotiationStore(this.dataSource, manager)));
  }
}
