import type { MigrationInterface, QueryRunner } from "typeorm";

// Milestones and their beneficiary lines, RF-23 receipt columns included. Amounts are integer minor units (bigint).
export class CreateMilestones1792108800000 implements MigrationInterface {
  name = "CreateMilestones1792108800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE milestones (
        id text PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        title text NOT NULL,
        amount bigint NOT NULL CHECK (amount > 0),
        currency text NOT NULL,
        asset_scale integer NOT NULL CHECK (asset_scale >= 0),
        status text NOT NULL,
        evidence_description text,
        evidence_submitted_at timestamptz,
        review_decision text,
        review_reason text,
        reviewed_at timestamptz,
        funded_at timestamptz,
        closed_at timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE TABLE milestone_lines (
        milestone_id text NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
        id text NOT NULL,
        position integer NOT NULL,
        kind text NOT NULL,
        beneficiary text NOT NULL,
        wallet_address text NOT NULL,
        amount bigint NOT NULL CHECK (amount > 0),
        status text NOT NULL,
        reference text,
        settled_at timestamptz,
        receipt_incoming_payment_id text,
        receipt_outgoing_payment_id text,
        receipt_quote_id text,
        receipt_debit_value bigint,
        receipt_debit_asset_code text,
        receipt_debit_asset_scale integer,
        receipt_receive_value bigint,
        receipt_receive_asset_code text,
        receipt_receive_asset_scale integer,
        receipt_rate text,
        receipt_fee bigint,
        receipt_grant_spent_before bigint,
        receipt_grant_spent_after bigint,
        PRIMARY KEY (milestone_id, id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE milestone_lines");
    await queryRunner.query("DROP TABLE milestones");
  }
}
