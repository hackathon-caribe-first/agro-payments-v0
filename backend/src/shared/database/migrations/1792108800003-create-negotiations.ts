import type { MigrationInterface, QueryRunner } from "typeorm";

// Block 3: project and open-request negotiations (quote_requests), their offer rounds (quotes, keyed by request + revision),
// the append-only history, the custody ledger and buyers' open requests; plus the buyer_deposit link on grants.
// Amounts are whole pesos like the web app's wire (projects keep their own minor-unit balances). Dates are ISO yyyy-mm-dd text,
// validated before they are stored, so they round-trip without timezone shifts. ponytail: buyer/producer user ids have no FK
// because Better Auth owns the "user" table outside these migrations.
export class CreateNegotiations1792108800003 implements MigrationInterface {
  name = "CreateNegotiations1792108800003";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE open_requests (
        id text PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        buyer_user_id text NOT NULL,
        buyer_name text NOT NULL,
        title text NOT NULL,
        production_type text NOT NULL,
        quantity bigint NOT NULL CHECK (quantity > 0),
        unit text NOT NULL,
        target_unit_price bigint,
        currency text NOT NULL,
        delivery_date text NOT NULL,
        delivery_location text NOT NULL,
        notes text NOT NULL,
        status text NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE quote_requests (
        id text PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        origin text NOT NULL CHECK (origin IN ('PROJECT_INTEREST', 'OPEN_REQUEST')),
        open_request_id text REFERENCES open_requests(id) ON DELETE CASCADE,
        scope text CHECK (scope IN ('PROJECT', 'MILESTONE')),
        milestone_id text REFERENCES milestones(id) ON DELETE CASCADE,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        producer_user_id text,
        producer_name text NOT NULL,
        buyer_user_id text NOT NULL,
        buyer_name text NOT NULL,
        quantity bigint NOT NULL,
        desired_delivery_date text NOT NULL,
        notes text NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL,
        agreed_total bigint,
        deposit_status text CHECK (deposit_status IN ('PENDING', 'DEPOSITED')),
        deposited_at timestamptz,
        ledger_entry_id text
      )
    `);
    await queryRunner.query("CREATE INDEX quote_requests_project ON quote_requests (project_id, seq)");
    await queryRunner.query("CREATE INDEX quote_requests_buyer ON quote_requests (buyer_user_id, seq)");
    await queryRunner.query("CREATE INDEX quote_requests_open_request ON quote_requests (open_request_id) WHERE open_request_id IS NOT NULL");
    await queryRunner.query(`
      CREATE TABLE quotes (
        request_id text NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
        revision integer NOT NULL CHECK (revision > 0),
        author text NOT NULL,
        unit_price bigint NOT NULL,
        quantity bigint NOT NULL,
        currency text NOT NULL,
        unit text,
        notes text,
        delivery_date text,
        valid_until text,
        delivery_terms text,
        status text NOT NULL,
        created_at timestamptz NOT NULL,
        PRIMARY KEY (request_id, revision)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE negotiation_history (
        request_id text NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
        id text NOT NULL,
        position integer NOT NULL,
        actor text NOT NULL,
        type text NOT NULL,
        from_status text,
        to_status text,
        at timestamptz NOT NULL,
        payload jsonb,
        PRIMARY KEY (request_id, id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE ledger_entries (
        id text PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type text NOT NULL CHECK (type IN ('CREDIT')),
        category text NOT NULL CHECK (category IN ('BUYER_DEPOSIT')),
        amount bigint NOT NULL CHECK (amount > 0),
        currency text NOT NULL,
        negotiation_id text NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
        buyer_user_id text NOT NULL,
        payment_reference text,
        created_at timestamptz NOT NULL
      )
    `);
    // One CREDIT per negotiation: a replayed deposit can never double the custody balance.
    await queryRunner.query("CREATE UNIQUE INDEX ledger_entries_one_deposit ON ledger_entries (negotiation_id) WHERE category = 'BUYER_DEPOSIT'");
    await queryRunner.query("ALTER TABLE grants ADD COLUMN negotiation_id text REFERENCES quote_requests(id) ON DELETE CASCADE");
    await queryRunner.query("CREATE INDEX grants_negotiation_latest ON grants (negotiation_id, created_at DESC) WHERE negotiation_id IS NOT NULL");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE grants DROP COLUMN negotiation_id");
    await queryRunner.query("DROP TABLE ledger_entries");
    await queryRunner.query("DROP TABLE negotiation_history");
    await queryRunner.query("DROP TABLE quotes");
    await queryRunner.query("DROP TABLE quote_requests");
    await queryRunner.query("DROP TABLE open_requests");
  }
}
