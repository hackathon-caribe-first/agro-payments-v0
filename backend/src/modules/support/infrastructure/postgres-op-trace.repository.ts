import type { DataSource } from "typeorm";
import type { OpTrace } from "../application/op-trace";
import { OpTraceRepository, type OpTraceQuery } from "../ports/op-trace.repository";

// Plain SQL over the TypeORM connection (migration SupportTraceNoticesIntake1792713600000). Insert-only.
type Row = Record<string, unknown>;

const toTrace = (r: Row): OpTrace => ({
  id: r.id as string,
  method: r.method as string,
  url: r.url as string,
  status: (r.status as number | null) ?? null,
  durationMs: r.duration_ms as number,
  requestBody: r.request_body ?? null,
  responseSummary: (r.response_summary as string | null) ?? null,
  error: (r.error as string | null) ?? null,
  curl: r.curl as string,
  projectId: (r.project_id as string | null) ?? null,
  milestoneId: (r.milestone_id as string | null) ?? null,
  negotiationId: (r.negotiation_id as string | null) ?? null,
  investmentId: (r.investment_id as string | null) ?? null,
  settlementId: (r.settlement_id as string | null) ?? null,
  createdAt: r.created_at as Date,
});

export class PostgresOpTraceRepository extends OpTraceRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async record(t: OpTrace) {
    await this.dataSource.query(
      `INSERT INTO op_traces (id, method, url, status, duration_ms, request_body, response_summary, error, curl,
                              project_id, milestone_id, negotiation_id, investment_id, settlement_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        t.id,
        t.method,
        t.url,
        t.status,
        t.durationMs,
        t.requestBody === null ? null : JSON.stringify(t.requestBody),
        t.responseSummary,
        t.error,
        t.curl,
        t.projectId,
        t.milestoneId,
        t.negotiationId,
        t.investmentId,
        t.settlementId,
        t.createdAt,
      ],
    );
  }

  async list({ projectId, limit }: OpTraceQuery) {
    const rows: Row[] = projectId
      ? await this.dataSource.query("SELECT * FROM op_traces WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2", [projectId, limit])
      : await this.dataSource.query("SELECT * FROM op_traces ORDER BY created_at DESC, id DESC LIMIT $1", [limit]);
    return rows.map(toTrace);
  }
}
