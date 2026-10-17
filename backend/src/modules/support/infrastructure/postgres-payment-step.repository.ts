import type { DataSource } from "typeorm";
import type { PaymentKind, PaymentStep, PaymentStepName } from "../application/payment-step";
import { PaymentStepRepository, type PaymentStepQuery } from "../ports/payment-step.repository";

// Plain SQL over the TypeORM connection (migration SupportPaymentSteps1792800000000). Insert-only; `at` comes from the database.
type Row = Record<string, unknown>;

const toStep = (r: Row): PaymentStep => ({
  kind: r.payment_kind as PaymentKind,
  paymentId: r.payment_id as string,
  step: r.step as PaymentStepName,
  at: r.at as Date,
  opUrl: (r.op_url as string | null) ?? null,
  detail: (r.detail as Record<string, unknown> | null) ?? null,
  projectId: (r.project_id as string | null) ?? null,
});

export class PostgresPaymentStepRepository extends PaymentStepRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async record(s: Omit<PaymentStep, "at">) {
    await this.dataSource.query(
      `INSERT INTO payment_steps (payment_kind, payment_id, step, op_url, detail, project_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (payment_kind, payment_id, step) DO NOTHING`,
      [s.kind, s.paymentId, s.step, s.opUrl, s.detail === null ? null : JSON.stringify(s.detail), s.projectId],
    );
  }

  async list({ projectId, paymentKind, paymentId, limit }: PaymentStepQuery) {
    const filters: [string, string | undefined][] = [
      ["project_id", projectId],
      ["payment_kind", paymentKind],
      ["payment_id", paymentId],
    ];
    const params: unknown[] = [];
    const where = filters.filter(([, value]) => value !== undefined).map(([column, value]) => `${column} = $${params.push(value)}`);
    const rows: Row[] = await this.dataSource.query(
      `SELECT * FROM payment_steps ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at, payment_kind, payment_id LIMIT $${params.push(limit)}`,
      params,
    );
    return rows.map(toStep);
  }
}
