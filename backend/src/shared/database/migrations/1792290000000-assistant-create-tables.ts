import type { MigrationInterface, QueryRunner } from "typeorm";

// Conversational assistant (PRD v3 RF-41): conversations, their messages and the intents they created, plus the per-user
// PIN hash (RNF-12). Messages and intents are append-only audit except an intent's status/decision columns.
export class AssistantCreateTables1792290000000 implements MigrationInterface {
  name = "AssistantCreateTables1792290000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // ponytail: user ids have no FK: Better Auth owns the "user" table and creates it outside these migrations.
    await queryRunner.query(`
      CREATE TABLE assistant_conversations (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        needs_technician boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query("CREATE INDEX assistant_conversations_user ON assistant_conversations (user_id, created_at)");
    await queryRunner.query(`
      CREATE TABLE assistant_messages (
        id text PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        conversation_id text NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
        text text NOT NULL,
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query("CREATE INDEX assistant_messages_conversation ON assistant_messages (conversation_id, seq)");
    await queryRunner.query(`
      CREATE TABLE assistant_intents (
        id text PRIMARY KEY,
        seq bigint GENERATED ALWAYS AS IDENTITY,
        conversation_id text NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        type text NOT NULL CHECK (type IN ('DRAFT_PROJECT', 'MILESTONE_EVIDENCE', 'ORDER_LINE')),
        payload jsonb NOT NULL,
        summary text NOT NULL,
        requires_pin boolean NOT NULL,
        status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),
        created_at timestamptz NOT NULL,
        decided_at timestamptz,
        decided_by text,
        result jsonb
      )
    `);
    await queryRunner.query("CREATE INDEX assistant_intents_conversation ON assistant_intents (conversation_id, seq)");
    await queryRunner.query(`
      CREATE TABLE assistant_pins (
        user_id text PRIMARY KEY,
        hash text NOT NULL,
        salt text NOT NULL,
        failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
        updated_at timestamptz NOT NULL
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE assistant_pins");
    await queryRunner.query("DROP TABLE assistant_intents");
    await queryRunner.query("DROP TABLE assistant_messages");
    await queryRunner.query("DROP TABLE assistant_conversations");
  }
}
