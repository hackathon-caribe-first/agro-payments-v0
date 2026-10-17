import type { MigrationInterface, QueryRunner } from "typeorm";

// PRD v3 RF-04 purchase contract, RF-05 ISA policy (with its RF-14 premium payment), RF-09 contract versions and signatures,
// RF-25 claims; and the custody ledger opened to DEBITs: PREMIUM leaves custody, INDEMNITY enters it. Both point at their
// payment or claim through reference_id, unique per category, so a replay can never move custody twice.
// Ordered after CreateHarvests1792627200000 (already applied on shared databases): the category CHECK rebuilt here keeps every
// category with its own clause (BUYER_DEPOSIT, INVESTOR_CAPITAL, HARVEST_PAYMENT, PREMIUM, INDEMNITY); down() restores the
// harvest-era constraint. Any later migration that touches ledger_entries_category_check must carry all of them forward.
export class ContractsCreateContractsAndInsurance1792656000000 implements MigrationInterface {
  name = "ContractsCreateContractsAndInsurance1792656000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE purchase_contracts (
        project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        price_type text NOT NULL CHECK (price_type IN ('fixed', 'formula')),
        price_per_unit bigint,
        floor_per_unit bigint,
        ceiling_per_unit bigint,
        price_reference text,
        quantity bigint NOT NULL CHECK (quantity > 0),
        unit text NOT NULL CHECK (unit IN ('kg', 't')),
        currency text NOT NULL CHECK (currency IN ('COP', 'USD')),
        buyer_user_id text NOT NULL,
        buyer_wallet_address text NOT NULL,
        buyer_wallet_asset_code text NOT NULL,
        buyer_wallet_asset_scale integer NOT NULL,
        updated_by text NOT NULL,
        updated_at timestamptz NOT NULL,
        CHECK (
          (price_type = 'fixed' AND price_per_unit > 0)
          OR (price_type = 'formula' AND floor_per_unit > 0 AND ceiling_per_unit >= floor_per_unit AND price_reference IS NOT NULL)
        )
      )`);
    await q.query(`
      CREATE TABLE insurance_policies (
        project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        insurer_name text NOT NULL,
        insurer_wallet_address text NOT NULL,
        beneficiary text NOT NULL CHECK (beneficiary = 'PATRIMONIO_AUTONOMO'),
        source text NOT NULL CHECK (source IN ('simulation', 'input')),
        simulation_run_id text,
        terms jsonb NOT NULL,
        premium_payment jsonb,
        updated_by text NOT NULL,
        updated_at timestamptz NOT NULL
      )`);
    await q.query(`
      CREATE TABLE contract_documents (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version integer NOT NULL CHECK (version > 0),
        body text NOT NULL,
        hash text NOT NULL,
        parties jsonb NOT NULL,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL,
        UNIQUE (project_id, version)
      )`);
    await q.query(`
      CREATE TABLE contract_signatures (
        seq bigint GENERATED ALWAYS AS IDENTITY,
        document_id text NOT NULL REFERENCES contract_documents(id) ON DELETE CASCADE,
        party_role text NOT NULL CHECK (party_role IN ('investor', 'fiduciaria', 'producer', 'buyer')),
        user_id text NOT NULL,
        signed_at timestamptz NOT NULL,
        ip text,
        user_agent text,
        contract_hash text NOT NULL,
        PRIMARY KEY (document_id, party_role, user_id)
      )`);
    await q.query(`
      CREATE TABLE insurance_claims (
        id text PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        trigger text NOT NULL CHECK (trigger IN ('yield', 'index')),
        observed_value numeric NOT NULL,
        evidence text NOT NULL,
        amount bigint NOT NULL CHECK (amount > 0),
        status text NOT NULL CHECK (status IN ('pending', 'confirmed')),
        incoming_payment_url text,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL,
        confirmed_by text,
        confirmed_at timestamptz
      )`);
    await q.query(`
      ALTER TABLE ledger_entries
        ADD COLUMN reference_id text,
        DROP CONSTRAINT ledger_entries_type_check,
        ADD CONSTRAINT ledger_entries_type_check CHECK (type IN ('CREDIT', 'DEBIT')),
        DROP CONSTRAINT ledger_entries_category_check,
        ADD CONSTRAINT ledger_entries_category_check CHECK (
          (category = 'BUYER_DEPOSIT' AND type = 'CREDIT' AND negotiation_id IS NOT NULL AND buyer_user_id IS NOT NULL)
          OR (category = 'INVESTOR_CAPITAL' AND type = 'CREDIT' AND investment_id IS NOT NULL)
          OR (category = 'HARVEST_PAYMENT' AND type = 'CREDIT' AND buyer_user_id IS NOT NULL)
          OR (category = 'PREMIUM' AND type = 'DEBIT' AND reference_id IS NOT NULL)
          OR (category = 'INDEMNITY' AND type = 'CREDIT' AND reference_id IS NOT NULL)
        )`);
    await q.query("CREATE UNIQUE INDEX ledger_entries_one_reference ON ledger_entries (category, reference_id) WHERE reference_id IS NOT NULL");
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP INDEX ledger_entries_one_reference");
    await q.query("DELETE FROM ledger_entries WHERE category IN ('PREMIUM', 'INDEMNITY')");
    await q.query(`
      ALTER TABLE ledger_entries
        DROP CONSTRAINT ledger_entries_category_check,
        ADD CONSTRAINT ledger_entries_category_check CHECK (
          (category = 'BUYER_DEPOSIT' AND negotiation_id IS NOT NULL AND buyer_user_id IS NOT NULL)
          OR (category = 'INVESTOR_CAPITAL' AND investment_id IS NOT NULL)
          OR (category = 'HARVEST_PAYMENT' AND buyer_user_id IS NOT NULL)
        ),
        DROP CONSTRAINT ledger_entries_type_check,
        ADD CONSTRAINT ledger_entries_type_check CHECK (type IN ('CREDIT')),
        DROP COLUMN reference_id`);
    await q.query("DROP TABLE insurance_claims");
    await q.query("DROP TABLE contract_signatures");
    await q.query("DROP TABLE contract_documents");
    await q.query("DROP TABLE insurance_policies");
    await q.query("DROP TABLE purchase_contracts");
  }
}
