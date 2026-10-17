import type { DataSource } from "typeorm";
import type { AdmissionOutcome, ProjectAdmission } from "../../application/admission";
import { AdmissionRepository } from "../../ports/admission.repository";

// Plain SQL (migration SupportTraceNoticesIntake1792713600000): filters, blocks and outcome are jsonb snapshots.
type Row = Record<string, unknown>;

const toAdmission = (r: Row): ProjectAdmission => ({
  id: r.id as string,
  projectId: r.project_id as string,
  filters: r.filters as ProjectAdmission["filters"],
  blocks: r.blocks as ProjectAdmission["blocks"],
  outcome: r.result as AdmissionOutcome,
  motorVersion: r.motor_version as string,
  createdBy: r.created_by as string,
  createdAt: r.created_at as Date,
});

export class PostgresAdmissionRepository extends AdmissionRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async save(a: ProjectAdmission) {
    await this.dataSource.query(
      `INSERT INTO project_admissions (id, project_id, filters, blocks, result, motor_version, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [a.id, a.projectId, JSON.stringify(a.filters), JSON.stringify(a.blocks), JSON.stringify(a.outcome), a.motorVersion, a.createdBy, a.createdAt],
    );
  }

  async findLatest(projectId: string) {
    const rows: Row[] = await this.dataSource.query("SELECT * FROM project_admissions WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1", [projectId]);
    return rows[0] ? toAdmission(rows[0]) : null;
  }
}
