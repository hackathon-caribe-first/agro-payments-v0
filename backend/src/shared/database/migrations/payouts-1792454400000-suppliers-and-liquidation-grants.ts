import type { MigrationInterface, QueryRunner } from "typeorm";

// PRD v3 RF-15 supplier registry, and RF-26's liquidation grant keyed by its settlement (grants.settlement_id).
export class PayoutsSuppliersAndLiquidationGrants1792454400000 implements MigrationInterface {
  name = "PayoutsSuppliersAndLiquidationGrants1792454400000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE suppliers (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        wallet_address text NOT NULL,
        asset_code text NOT NULL,
        asset_scale integer NOT NULL,
        created_at timestamptz NOT NULL
      )`);
    // The assistant matches the dictated name, so it is unique regardless of case.
    await q.query(`CREATE UNIQUE INDEX suppliers_name_lower_key ON suppliers (lower(name))`);
    await q.query(`ALTER TABLE grants ADD COLUMN settlement_id text NULL`);
    await q.query(`CREATE INDEX grants_settlement_idx ON grants (settlement_id, created_at) WHERE settlement_id IS NOT NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX grants_settlement_idx`);
    await q.query(`ALTER TABLE grants DROP COLUMN settlement_id`);
    await q.query(`DROP TABLE suppliers`);
  }
}
