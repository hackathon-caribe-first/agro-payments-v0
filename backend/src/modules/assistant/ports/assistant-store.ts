import type { Conversation, Intent, Message } from "../application/assistant";

// Conversations, their messages and the intents they produced (RF-41 audit). Abstract class so it doubles as the DI token.
export abstract class AssistantStore {
  abstract createConversation(conversation: Conversation): Promise<void>;
  abstract findConversation(id: string): Promise<Conversation | null>;
  abstract flagTechnician(conversationId: string): Promise<void>;
  /** Appended in order; listMessages returns them in that order. */
  abstract appendMessages(messages: Message[]): Promise<void>;
  abstract listMessages(conversationId: string): Promise<Message[]>;
  /** Insert or replace by id. */
  abstract saveIntent(intent: Intent): Promise<void>;
  abstract findIntent(id: string): Promise<Intent | null>;
  /** Oldest first. */
  abstract listIntents(conversationId: string): Promise<Intent[]>;
}

/** Per-user PIN: scrypt hash and salt (hex), and the failed attempts since the last success. */
export type PinRecord = { userId: string; hash: string; salt: string; failedAttempts: number; updatedAt: Date };

export abstract class PinStore {
  abstract find(userId: string): Promise<PinRecord | null>;
  abstract save(record: PinRecord): Promise<void>;
}
