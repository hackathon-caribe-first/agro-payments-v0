import type { DataSource } from "typeorm";
import type { Conversation, Intent, IntentPayload, Message } from "../../application/assistant";
import { AssistantStore, type PinRecord, PinStore } from "../../ports/assistant-store";

// Plain SQL over the TypeORM connection: four small tables (migration AssistantCreateTables1792290000000), no entities to register.
type Row = Record<string, unknown>;

const toConversation = (r: Row): Conversation => ({
  id: r.id as string,
  userId: r.user_id as string,
  needsTechnician: r.needs_technician as boolean,
  createdAt: r.created_at as Date,
});

const toMessage = (r: Row): Message => ({
  id: r.id as string,
  conversationId: r.conversation_id as string,
  role: r.role as Message["role"],
  text: r.text as string,
  createdAt: r.created_at as Date,
});

export const toIntent = (r: Row): Intent => ({
  ...({ type: r.type, data: r.payload } as IntentPayload),
  id: r.id as string,
  conversationId: r.conversation_id as string,
  userId: r.user_id as string,
  summary: r.summary as string,
  requiresPin: r.requires_pin as boolean,
  status: r.status as Intent["status"],
  createdAt: r.created_at as Date,
  decidedAt: (r.decided_at as Date | null) ?? null,
  decidedBy: (r.decided_by as string | null) ?? null,
  result: (r.result as Record<string, unknown> | null) ?? null,
});

export const INTENT_COLUMNS = "id, conversation_id, user_id, type, payload, summary, requires_pin, status, created_at, decided_at, decided_by, result";

export class PostgresAssistantStore extends AssistantStore {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async createConversation(c: Conversation) {
    await this.dataSource.query("INSERT INTO assistant_conversations (id, user_id, needs_technician, created_at) VALUES ($1, $2, $3, $4)", [
      c.id,
      c.userId,
      c.needsTechnician,
      c.createdAt,
    ]);
  }

  async findConversation(id: string) {
    const [row] = await this.dataSource.query("SELECT * FROM assistant_conversations WHERE id = $1", [id]);
    return row ? toConversation(row) : null;
  }

  async findLatestConversation(userId: string) {
    const [row] = await this.dataSource.query("SELECT * FROM assistant_conversations WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1", [userId]);
    return row ? toConversation(row) : null;
  }

  async flagTechnician(id: string) {
    await this.dataSource.query("UPDATE assistant_conversations SET needs_technician = true WHERE id = $1", [id]);
  }

  async appendMessages(messages: Message[]) {
    // One statement per message, in order, so seq keeps the conversation order.
    for (const m of messages) {
      await this.dataSource.query("INSERT INTO assistant_messages (id, conversation_id, role, text, created_at) VALUES ($1, $2, $3, $4, $5)", [
        m.id,
        m.conversationId,
        m.role,
        m.text,
        m.createdAt,
      ]);
    }
  }

  async listMessages(conversationId: string) {
    const rows: Row[] = await this.dataSource.query("SELECT * FROM assistant_messages WHERE conversation_id = $1 ORDER BY seq", [conversationId]);
    return rows.map(toMessage);
  }

  async saveIntent(i: Intent) {
    // The payload, summary and creation are immutable audit; only the decision columns change.
    await this.dataSource.query(
      `INSERT INTO assistant_intents (${INTENT_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, decided_by = EXCLUDED.decided_by, result = EXCLUDED.result`,
      [i.id, i.conversationId, i.userId, i.type, JSON.stringify(i.data), i.summary, i.requiresPin, i.status, i.createdAt, i.decidedAt, i.decidedBy, i.result === null ? null : JSON.stringify(i.result)],
    );
  }

  async findIntent(id: string) {
    const [row] = await this.dataSource.query(`SELECT ${INTENT_COLUMNS} FROM assistant_intents WHERE id = $1`, [id]);
    return row ? toIntent(row) : null;
  }

  async listIntents(conversationId: string) {
    const rows: Row[] = await this.dataSource.query(`SELECT ${INTENT_COLUMNS} FROM assistant_intents WHERE conversation_id = $1 ORDER BY seq`, [conversationId]);
    return rows.map(toIntent);
  }
}

export class PostgresPinStore extends PinStore {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async find(userId: string): Promise<PinRecord | null> {
    const [row] = await this.dataSource.query("SELECT * FROM assistant_pins WHERE user_id = $1", [userId]);
    return row ? { userId: row.user_id, hash: row.hash, salt: row.salt, failedAttempts: row.failed_attempts, updatedAt: row.updated_at } : null;
  }

  async save(r: PinRecord) {
    await this.dataSource.query(
      `INSERT INTO assistant_pins (user_id, hash, salt, failed_attempts, updated_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, salt = EXCLUDED.salt, failed_attempts = EXCLUDED.failed_attempts, updated_at = EXCLUDED.updated_at`,
      [r.userId, r.hash, r.salt, r.failedAttempts, r.updatedAt],
    );
  }
}
