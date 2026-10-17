import type { MigrationInterface, QueryRunner } from "typeorm";

// Producer projects (PRD `projects`) with a per-year code sequence, and the PRD milestone fields: project link, order,
// requirements, evidence logs and review history. New milestone columns are nullable or defaulted so the projectless
// demo milestones keep loading unchanged.
export class CreateProjects1792108800002 implements MigrationInterface {
  name = "CreateProjects1792108800002";

  async up(queryRunner: QueryRunner): Promise<void> {
    // ponytail: owner_user_id has no FK: Better Auth owns the "user" table and creates it outside these migrations.
    await queryRunner.query(`
      CREATE TABLE projects (
        id text PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        owner_user_id text NOT NULL,
        project_code text NOT NULL UNIQUE,
        title text NOT NULL,
        production_type text NOT NULL,
        description text NOT NULL,
        target_amount bigint NOT NULL CHECK (target_amount >= 0),
        custody_balance bigint NOT NULL DEFAULT 0 CHECK (custody_balance >= 0),
        total_disbursed bigint NOT NULL DEFAULT 0 CHECK (total_disbursed >= 0),
        investor_roi_pct double precision NOT NULL DEFAULT 0,
        platform_fee_pct double precision NOT NULL,
        current_status text NOT NULL,
        start_date date NOT NULL,
        estimated_end_date date NOT NULL,
        currency text NOT NULL,
        asset_scale integer NOT NULL CHECK (asset_scale >= 0),
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query("CREATE INDEX projects_owner ON projects (owner_user_id, seq)");
    // AGR-YYYY-NNN: one counter row per year, bumped atomically inside the transaction that inserts the project.
    await queryRunner.query("CREATE TABLE project_code_sequences (year integer PRIMARY KEY, last_value integer NOT NULL)");

    await queryRunner.query(`
      ALTER TABLE milestones
        ADD COLUMN project_id text REFERENCES projects(id) ON DELETE CASCADE,
        ADD COLUMN sequence_order integer CHECK (sequence_order > 0),
        ADD COLUMN description text NOT NULL DEFAULT '',
        ADD COLUMN estimated_completion_date date,
        ADD COLUMN required_evidences jsonb NOT NULL DEFAULT '[]',
        ADD CONSTRAINT milestones_project_sequence UNIQUE (project_id, sequence_order)
    `);
    await queryRunner.query(`
      CREATE TABLE milestone_evidence_logs (
        milestone_id text NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
        id text NOT NULL,
        position integer NOT NULL,
        log_type text NOT NULL,
        notes text NOT NULL,
        evidence_payload jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        PRIMARY KEY (milestone_id, id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE milestone_reviews (
        milestone_id text NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
        id text NOT NULL,
        position integer NOT NULL,
        verdict text NOT NULL CHECK (verdict IN ('submitted', 'observado', 'approved', 'payout_executed')),
        comment text,
        created_at timestamptz NOT NULL,
        PRIMARY KEY (milestone_id, id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE milestone_reviews");
    await queryRunner.query("DROP TABLE milestone_evidence_logs");
    await queryRunner.query(`
      ALTER TABLE milestones
        DROP CONSTRAINT milestones_project_sequence,
        DROP COLUMN required_evidences,
        DROP COLUMN estimated_completion_date,
        DROP COLUMN description,
        DROP COLUMN sequence_order,
        DROP COLUMN project_id
    `);
    await queryRunner.query("DROP TABLE project_code_sequences");
    await queryRunner.query("DROP TABLE projects");
  }
}
