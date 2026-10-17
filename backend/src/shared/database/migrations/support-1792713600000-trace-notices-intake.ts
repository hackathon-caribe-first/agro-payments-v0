import type { MigrationInterface, QueryRunner } from "typeorm";

// RF-28 Open Payments trace, RF-37 notices, RF-01 plot polygon + producer wallet, RF-02/RF-03 admission, RF-19/RF-35 evidence
// attestation. op_traces and notifications are append-only (notifications only flip read_at).
export class SupportTraceNoticesIntake1792713600000 implements MigrationInterface {
  name = "SupportTraceNoticesIntake1792713600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE op_traces (
        id text PRIMARY KEY,
        method text NOT NULL,
        url text NOT NULL,
        status integer,
        duration_ms integer NOT NULL,
        request_body jsonb,
        response_summary text,
        error text,
        curl text NOT NULL,
        project_id text,
        milestone_id text,
        negotiation_id text,
        investment_id text,
        settlement_id text,
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query("CREATE INDEX op_traces_created ON op_traces (created_at DESC)");
    await queryRunner.query("CREATE INDEX op_traces_project ON op_traces (project_id, created_at DESC)");

    await queryRunner.query(`
      CREATE TABLE notifications (
        id text PRIMARY KEY,
        recipient_user_id text,
        recipient_role text,
        kind text NOT NULL,
        title text NOT NULL,
        body text NOT NULL,
        project_id text,
        milestone_id text,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL,
        read_at timestamptz,
        CHECK (recipient_user_id IS NOT NULL OR recipient_role IS NOT NULL)
      )
    `);
    await queryRunner.query("CREATE INDEX notifications_user ON notifications (recipient_user_id, created_at DESC)");
    await queryRunner.query("CREATE INDEX notifications_role ON notifications (recipient_role, created_at DESC)");

    await queryRunner.query(`
      CREATE TABLE project_admissions (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        filters jsonb NOT NULL,
        blocks jsonb NOT NULL,
        result jsonb NOT NULL,
        motor_version text NOT NULL,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query("CREATE INDEX project_admissions_project ON project_admissions (project_id, created_at DESC)");

    await queryRunner.query("ALTER TABLE projects ADD COLUMN plot_polygon jsonb, ADD COLUMN producer_wallet_address text");
    await queryRunner.query("ALTER TABLE milestone_evidence_logs ADD COLUMN attestation jsonb");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE milestone_evidence_logs DROP COLUMN attestation");
    await queryRunner.query("ALTER TABLE projects DROP COLUMN plot_polygon, DROP COLUMN producer_wallet_address");
    await queryRunner.query("DROP TABLE project_admissions");
    await queryRunner.query("DROP TABLE notifications");
    await queryRunner.query("DROP TABLE op_traces");
  }
}
