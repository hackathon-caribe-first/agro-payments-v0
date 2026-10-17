import type { MigrationInterface, QueryRunner } from "typeorm";

// PRD v3 RF-24 / Fase 3: one harvest per project (declared by the producer, certified by the verifier, paid by the buyer into
// custody, received by the buyer), and the custody ledger opened to HARVEST_PAYMENT credits. A harvest credit points at its
// project (one per project) and its buyer, never at a negotiation or an investment.
// Integration note: another branch may also extend ledger_entries_category_check; merge both OR branches.
export class CreateHarvests1792627200000 implements MigrationInterface {
  name = "CreateHarvests1792627200000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE harvests (
        project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        status text NOT NULL CHECK (status IN ('DECLARED', 'CERTIFIED', 'PAID', 'RECEIVED')),
        declared_quantity_kg bigint NOT NULL CHECK (declared_quantity_kg > 0),
        declared_quality text NOT NULL,
        evidence text NOT NULL,
        declared_by text NOT NULL,
        declared_at timestamptz NOT NULL,
        certified_quantity_kg bigint CHECK (certified_quantity_kg > 0),
        certified_quality text,
        certification_notes text,
        certified_by text,
        certified_at timestamptz,
        price jsonb,
        amount_due bigint CHECK (amount_due > 0),
        currency text NOT NULL,
        asset_scale integer NOT NULL CHECK (asset_scale >= 0),
        buyer_user_id text,
        payment_reference text,
        paid_at timestamptz,
        received_at timestamptz
      )
    `);
    await q.query(`
      ALTER TABLE ledger_entries
        DROP CONSTRAINT ledger_entries_category_check,
        ADD CONSTRAINT ledger_entries_category_check CHECK (
          (category = 'BUYER_DEPOSIT' AND negotiation_id IS NOT NULL AND buyer_user_id IS NOT NULL)
          OR (category = 'INVESTOR_CAPITAL' AND investment_id IS NOT NULL)
          OR (category = 'HARVEST_PAYMENT' AND buyer_user_id IS NOT NULL)
        )
    `);
    // One harvest CREDIT per project: a replayed callback can never double the custody balance.
    await q.query("CREATE UNIQUE INDEX ledger_entries_one_harvest ON ledger_entries (project_id) WHERE category = 'HARVEST_PAYMENT'");
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP INDEX ledger_entries_one_harvest");
    await q.query("DELETE FROM ledger_entries WHERE category = 'HARVEST_PAYMENT'");
    await q.query(`
      ALTER TABLE ledger_entries
        DROP CONSTRAINT ledger_entries_category_check,
        ADD CONSTRAINT ledger_entries_category_check CHECK (
          (category = 'BUYER_DEPOSIT' AND negotiation_id IS NOT NULL AND buyer_user_id IS NOT NULL)
          OR (category = 'INVESTOR_CAPITAL' AND investment_id IS NOT NULL)
        )
    `);
    await q.query("DROP TABLE harvests");
  }
}
