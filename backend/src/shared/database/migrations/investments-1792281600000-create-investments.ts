import type { MigrationInterface, QueryRunner } from "typeorm";

// Block 4: investor capture (RF-10, RF-29). One row per investment with its quote (RNF-10: both amounts in minor units and
// the implied rate as an exact "n/d" string); the investor_capture link on grants; and the custody ledger opened to
// INVESTOR_CAPITAL credits, which point at an investment instead of a negotiation and buyer.
// ponytail: investor user ids have no FK because Better Auth owns the "user" table outside these migrations.
export class CreateInvestments1792281600000 implements MigrationInterface {
  name = "CreateInvestments1792281600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE investments (
        id text PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        investor_user_id text NOT NULL,
        wallet_address text NOT NULL,
        status text NOT NULL CHECK (status IN ('PENDING_CONSENT', 'CAPTURED', 'FAILED')),
        failure_reason text,
        amount bigint NOT NULL CHECK (amount > 0),
        currency text NOT NULL,
        asset_scale integer NOT NULL,
        quote_id text,
        debit_amount bigint,
        debit_asset_code text,
        debit_asset_scale integer,
        receive_amount bigint,
        quote_expires_at timestamptz,
        implied_rate text,
        incoming_payment_id text,
        outgoing_payment_id text,
        created_at timestamptz NOT NULL,
        captured_at timestamptz
      )
    `);
    await queryRunner.query("CREATE INDEX investments_project ON investments (project_id, seq)");
    await queryRunner.query("ALTER TABLE grants ADD COLUMN investment_id text REFERENCES investments(id) ON DELETE CASCADE");
    await queryRunner.query("CREATE INDEX grants_investment_latest ON grants (investment_id, created_at DESC) WHERE investment_id IS NOT NULL");
    await queryRunner.query(`
      ALTER TABLE ledger_entries
        ALTER COLUMN negotiation_id DROP NOT NULL,
        ALTER COLUMN buyer_user_id DROP NOT NULL,
        ADD COLUMN investment_id text REFERENCES investments(id) ON DELETE CASCADE,
        DROP CONSTRAINT ledger_entries_category_check,
        ADD CONSTRAINT ledger_entries_category_check CHECK (
          (category = 'BUYER_DEPOSIT' AND negotiation_id IS NOT NULL AND buyer_user_id IS NOT NULL)
          OR (category = 'INVESTOR_CAPITAL' AND investment_id IS NOT NULL)
        )
    `);
    // One CREDIT per investment: a replayed callback can never double the custody balance.
    await queryRunner.query("CREATE UNIQUE INDEX ledger_entries_one_capture ON ledger_entries (investment_id) WHERE category = 'INVESTOR_CAPITAL'");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DELETE FROM ledger_entries WHERE category = 'INVESTOR_CAPITAL'");
    await queryRunner.query(`
      ALTER TABLE ledger_entries
        DROP CONSTRAINT ledger_entries_category_check,
        ADD CONSTRAINT ledger_entries_category_check CHECK (category IN ('BUYER_DEPOSIT')),
        DROP COLUMN investment_id,
        ALTER COLUMN negotiation_id SET NOT NULL,
        ALTER COLUMN buyer_user_id SET NOT NULL
    `);
    await queryRunner.query("ALTER TABLE grants DROP COLUMN investment_id");
    await queryRunner.query("DROP TABLE investments");
  }
}
