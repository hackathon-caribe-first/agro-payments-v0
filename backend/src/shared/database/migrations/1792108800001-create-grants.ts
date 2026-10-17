import type { MigrationInterface, QueryRunner } from "typeorm";

// Outgoing-payment grants on a payer wallet (v3: custody). One table for every purpose; purpose stays open text
// because capture, buyer and liquidation grants come later. *_enc columns hold AES-256-GCM sealed values, never plaintext.
export class CreateGrants1792108800001 implements MigrationInterface {
  name = "CreateGrants1792108800001";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE grants (
        id uuid PRIMARY KEY,
        purpose text NOT NULL,
        project_id text,
        milestone_id text REFERENCES milestones(id) ON DELETE CASCADE,
        payer_wallet_address text NOT NULL,
        asset_code text NOT NULL,
        asset_scale integer NOT NULL CHECK (asset_scale >= 0),
        debit_limit bigint NOT NULL CHECK (debit_limit > 0),
        status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
        pending_client_nonce_enc text,
        pending_finish_nonce_enc text,
        pending_continue_uri text,
        pending_continue_token_enc text,
        pending_auth_server text,
        access_token_enc text,
        manage_url text,
        continue_uri text,
        continue_token_enc text,
        created_at timestamptz NOT NULL,
        revoked_at timestamptz
      )
    `);
    await queryRunner.query("CREATE INDEX grants_milestone_latest ON grants (milestone_id, created_at DESC) WHERE milestone_id IS NOT NULL");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE grants");
  }
}
