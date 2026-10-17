import type { MigrationInterface, QueryRunner } from "typeorm";

// Append-only timeline of every payment (one row per lifecycle step), so a status that is upserted elsewhere (milestone_lines,
// settlement_payouts, grants, deposits) keeps its history. A step is written once: inserts use ON CONFLICT DO NOTHING.
// project_id is text like every other project reference (projects.id is text).
export class SupportPaymentSteps1792800000000 implements MigrationInterface {
  name = "SupportPaymentSteps1792800000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payment_steps (
        payment_kind text NOT NULL,
        payment_id text NOT NULL,
        step text NOT NULL,
        at timestamptz NOT NULL DEFAULT clock_timestamp(),
        op_url text,
        detail jsonb,
        project_id text,
        PRIMARY KEY (payment_kind, payment_id, step)
      )
    `);
    await queryRunner.query("CREATE INDEX payment_steps_project ON payment_steps (project_id, at)");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE payment_steps");
  }
}
