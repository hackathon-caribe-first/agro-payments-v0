import type { MigrationInterface, QueryRunner } from "typeorm";

// RF-06/RNF-11 motor runs: every sheet with the inputs, seed and motor version that produced it. Insert-only; the newest
// run per project is its sheet and gates publication (RF-07).
export class CreateSimulationRuns1792368000000 implements MigrationInterface {
  name = "CreateSimulationRuns1792368000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE simulation_runs (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        preset text,
        inputs jsonb NOT NULL,
        seed bigint NOT NULL CHECK (seed >= 0 AND seed <= 4294967295),
        motor_version text NOT NULL,
        outputs jsonb NOT NULL,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query("CREATE INDEX simulation_runs_project ON simulation_runs (project_id, created_at)");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE simulation_runs");
  }
}
