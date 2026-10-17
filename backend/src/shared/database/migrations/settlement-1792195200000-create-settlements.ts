import type { MigrationInterface, QueryRunner } from "typeorm";

// RF-26 liquidations: the cascade plan snapshot per project and one payout per beneficiary with its RF-23 receipt.
// The plan and terms are jsonb snapshots (read back as a whole, never queried by field); payouts are rows so their
// status and receipts update one by one. At most one approved/executing/executed settlement per project.
export class CreateSettlements1792195200000 implements MigrationInterface {
  name = "CreateSettlements1792195200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE settlements (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        status text NOT NULL CHECK (status IN ('draft', 'approved', 'executing', 'executed', 'failed')),
        currency text NOT NULL,
        asset_scale integer NOT NULL CHECK (asset_scale >= 0),
        preferred_rate_bps integer NOT NULL CHECK (preferred_rate_bps >= 0),
        terms jsonb NOT NULL,
        plan jsonb NOT NULL,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL,
        approved_by text,
        approved_at timestamptz,
        executed_at timestamptz
      )
    `);
    await queryRunner.query("CREATE INDEX settlements_project ON settlements (project_id, created_at)");
    await queryRunner.query("CREATE UNIQUE INDEX settlements_one_active ON settlements (project_id) WHERE status IN ('approved', 'executing', 'executed')");
    await queryRunner.query(`
      CREATE TABLE settlement_payouts (
        settlement_id text NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
        id text NOT NULL,
        position integer NOT NULL,
        beneficiary_kind text NOT NULL CHECK (beneficiary_kind IN ('integrator', 'investor', 'producer', 'platform')),
        beneficiary_id text NOT NULL,
        wallet_address text NOT NULL,
        wallet_currency text NOT NULL,
        amount bigint NOT NULL CHECK (amount > 0),
        fixed_debit_amount boolean NOT NULL,
        status text NOT NULL CHECK (status IN ('pending', 'executing', 'executed', 'failed')),
        reference text,
        settled_at timestamptz,
        receipt jsonb,
        PRIMARY KEY (settlement_id, id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE settlement_payouts");
    await queryRunner.query("DROP TABLE settlements");
  }
}
