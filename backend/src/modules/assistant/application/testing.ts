// Test doubles shared by the assistant specs. No network: the model is scripted.
import { AssistantModel, type ModelRequest, type ModelTurn, type ToolCall } from "../ports/assistant-model";
import { AssistantStore, type PinRecord, PinStore } from "../ports/assistant-store";
import type { Conversation, Intent, Message } from "./assistant";

export class FakePinStore extends PinStore {
  private readonly records = new Map<string, PinRecord>();
  async find(userId: string) {
    return this.records.get(userId) ?? null;
  }
  async save(record: PinRecord) {
    this.records.set(record.userId, { ...record });
  }
}

export class FakeAssistantStore extends AssistantStore {
  readonly conversations = new Map<string, Conversation>();
  readonly messages: Message[] = [];
  readonly intents = new Map<string, Intent>();

  async createConversation(c: Conversation) {
    this.conversations.set(c.id, { ...c });
  }
  async findConversation(id: string) {
    return this.conversations.get(id) ?? null;
  }
  async flagTechnician(id: string) {
    const c = this.conversations.get(id);
    if (c) c.needsTechnician = true;
  }
  async appendMessages(messages: Message[]) {
    this.messages.push(...messages);
  }
  async listMessages(conversationId: string) {
    return this.messages.filter((m) => m.conversationId === conversationId);
  }
  async saveIntent(intent: Intent) {
    this.intents.set(intent.id, structuredClone(intent));
  }
  async findIntent(id: string) {
    const intent = this.intents.get(id);
    return intent ? structuredClone(intent) : null;
  }
  async listIntents(conversationId: string) {
    return [...this.intents.values()].filter((i) => i.conversationId === conversationId).map((i) => structuredClone(i));
  }
}

export const answer = (text: string): ModelTurn => ({ outcome: "answer", text, toolCalls: [], raw: [{ type: "text", text }] });
export const callTool = (name: string, input: unknown, id = `toolu_${name}`): ModelTurn => {
  const call: ToolCall = { id, name, input };
  return { outcome: "tool_calls", text: "", toolCalls: [call], raw: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", ...call }] };
};

/** Plays turns in order and keeps a deep copy of every request, so specs can assert what reached the model. */
export class ScriptedModel extends AssistantModel {
  readonly requests: ModelRequest[] = [];
  constructor(private readonly turns: ModelTurn[]) {
    super();
  }
  async next(request: ModelRequest) {
    this.requests.push(structuredClone(request));
    const turn = this.turns.shift();
    if (!turn) throw new Error("ScriptedModel ran out of turns");
    return turn;
  }
}
