import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DomainError, NotFoundError, ValidationError } from "../../../shared/domain-errors";
import type { Viewer } from "../../projects/application/project";
import { AssistantModel, type ModelMessage, type ToolResult } from "../ports/assistant-model";
import { AssistantStore } from "../ports/assistant-store";
import {
  type Conversation,
  type Intent,
  INTENT_STATUS,
  type IntentPayload,
  isExpired,
  type Message,
  MESSAGE_ROLE,
  type MessageRole,
  requiresPin,
} from "./assistant";
import { PinUseCase } from "./pin";
import { isNotUnderstood, NOT_UNDERSTOOD_REPLY, PIN_IN_CHAT_REPLY, PIN_NEEDED_REPLY, REFUSAL_REPLY, SYSTEM_PROMPT } from "./system-prompt";
import { confirmationPrompt, decisionReply, summarize } from "./templates";
import { AssistantTools, TOOL_DEFINITIONS } from "./tools";

/** Model requests per producer message; past it the turn escalates instead of looping. */
export const MAX_MODEL_STEPS = 5;
export const TEXT_MAX_LENGTH = 2000;
/** What the audit keeps instead of a message that looks like the PIN. */
export const HIDDEN_PIN_TEXT = "[mensaje oculto: parecía un PIN]";

const isYes = (text: string) => /^\s*(s[ií]|sí señor|si señor|confirmo|de acuerdo)\s*[.!]*\s*$/i.test(text);
const isNo = (text: string) => /^\s*(no|cancele|cancelar)\s*[.!]*\s*$/i.test(text);
const looksLikePin = (text: string) => /^\s*\d{4}\s*$/.test(text);

export type Reply = { conversation: Conversation; reply: string; intent: Intent | null };

@Injectable()
export class IntentDecisionUseCase {
  constructor(
    private readonly store: AssistantStore,
    private readonly tools: AssistantTools,
    private readonly pins: PinUseCase,
  ) {}

  /** The explicit "sí" (D-14), with the PIN for order lines. The PIN is checked here and goes nowhere else. */
  async confirm(viewer: Viewer, intentId: string, pin?: unknown) {
    const intent = await this.pending(viewer, intentId);
    if (intent.requiresPin) await this.pins.verify(viewer.id, pin);
    const result = await this.tools.execute(intent, viewer);
    return this.decide(intent, viewer, INTENT_STATUS.CONFIRMED, result);
  }

  async reject(viewer: Viewer, intentId: string) {
    return this.decide(await this.pending(viewer, intentId), viewer, INTENT_STATUS.REJECTED, null);
  }

  private async pending(viewer: Viewer, intentId: string): Promise<Intent> {
    const intent = await this.store.findIntent(intentId);
    if (!intent || intent.userId !== viewer.id) throw new NotFoundError(`Intent ${intentId} not found`);
    if (intent.status === INTENT_STATUS.PENDING && isExpired(intent, new Date())) {
      await this.store.saveIntent({ ...intent, status: INTENT_STATUS.EXPIRED });
      throw new DomainError("La solicitud venció. Pídala de nuevo al asistente.");
    }
    if (intent.status !== INTENT_STATUS.PENDING) throw new DomainError(`La solicitud ya está ${intent.status}.`);
    return intent;
  }

  private async decide(intent: Intent, viewer: Viewer, status: Intent["status"], result: Intent["result"]) {
    const decided: Intent = { ...intent, status, decidedAt: new Date(), decidedBy: viewer.id, result };
    await this.store.saveIntent(decided);
    const reply = decisionReply(decided, status, result);
    await this.store.appendMessages([message(intent.conversationId, MESSAGE_ROLE.ASSISTANT, reply)]);
    return { intent: decided, reply };
  }
}

const message = (conversationId: string, role: MessageRole, text: string): Message => ({ id: randomUUID(), conversationId, role, text, createdAt: new Date() });

@Injectable()
export class ConverseUseCase {
  constructor(
    private readonly store: AssistantStore,
    private readonly model: AssistantModel,
    private readonly tools: AssistantTools,
    private readonly decisions: IntentDecisionUseCase,
  ) {}

  async get(viewer: Viewer, conversationId: string) {
    const conversation = await this.owned(viewer, conversationId);
    return { conversation, messages: await this.store.listMessages(conversation.id), intents: await this.store.listIntents(conversation.id) };
  }

  async send(viewer: Viewer, request: { conversationId?: unknown; text: unknown }): Promise<Reply> {
    if (typeof request.text !== "string" || request.text.trim().length === 0) throw new ValidationError({ text: ["Escriba un mensaje."] }, "Empty message");
    if (request.text.length > TEXT_MAX_LENGTH) throw new ValidationError({ text: [`Máximo ${TEXT_MAX_LENGTH} caracteres.`] }, "Message too long");
    const text = request.text.trim();
    const existing = typeof request.conversationId === "string" && request.conversationId !== "" ? await this.owned(viewer, request.conversationId) : null;
    const conversation: Conversation = existing ?? { id: randomUUID(), userId: viewer.id, needsTechnician: false, createdAt: new Date() };
    const pending = existing ? await this.latestPending(existing.id) : null;

    // RNF-12: a message that looks like the PIN never reaches the model and is not kept as typed.
    if (pending?.requiresPin && looksLikePin(text)) {
      return this.finish(conversation, existing === null, [message(conversation.id, MESSAGE_ROLE.USER, HIDDEN_PIN_TEXT)], PIN_IN_CHAT_REPLY, pending);
    }
    if (pending && (isYes(text) || isNo(text))) {
      const said = [message(conversation.id, MESSAGE_ROLE.USER, text)];
      if (isYes(text) && pending.requiresPin) return this.finish(conversation, false, said, PIN_NEEDED_REPLY, pending);
      await this.store.appendMessages(said);
      const decided = isYes(text) ? await this.decisions.confirm(viewer, pending.id) : await this.decisions.reject(viewer, pending.id);
      return { conversation, reply: decided.reply, intent: decided.intent };
    }

    const history = existing ? await this.store.listMessages(existing.id) : [];
    return this.converse(viewer, conversation, existing === null, history, text);
  }

  // Manual tool loop: read tools feed the model; the first intent ends the turn with a code-rendered template, so the model
  // never words a money confirmation. Refusals, truncation and an exhausted loop all escalate to a technician (RF-37).
  private async converse(viewer: Viewer, conversation: Conversation, isNew: boolean, history: Message[], text: string): Promise<Reply> {
    const messages: ModelMessage[] = [
      ...history.filter((m) => m.role !== MESSAGE_ROLE.TOOL).map((m): ModelMessage => (m.role === MESSAGE_ROLE.USER ? { role: "user", text: m.text } : { role: "assistant", text: m.text })),
      { role: "user", text },
    ];
    const audit = [message(conversation.id, MESSAGE_ROLE.USER, text)];
    const now = new Date();
    for (let step = 0; step < MAX_MODEL_STEPS; step++) {
      const turn = await this.model.next({ system: SYSTEM_PROMPT, tools: TOOL_DEFINITIONS, messages });
      if (turn.outcome === "refusal") return this.escalate(conversation, isNew, audit, REFUSAL_REPLY);
      if (turn.outcome === "answer") {
        const reply = turn.text.trim();
        if (reply === "") return this.escalate(conversation, isNew, audit, NOT_UNDERSTOOD_REPLY);
        if (isNotUnderstood(reply)) return this.escalate(conversation, isNew, audit, reply);
        return this.finish(conversation, isNew, audit, reply, null);
      }
      if (turn.outcome !== "tool_calls" || turn.toolCalls.length === 0) return this.escalate(conversation, isNew, audit, NOT_UNDERSTOOD_REPLY);

      messages.push({ role: "assistant", text: turn.text, raw: turn.raw });
      const results: ToolResult[] = [];
      for (const call of turn.toolCalls) {
        const outcome = await this.tools.run(call, viewer, now);
        if (outcome.kind === "intent") {
          const intent = this.newIntent(conversation.id, viewer, outcome.payload);
          await this.saveConversation(conversation, isNew);
          await this.store.saveIntent(intent);
          audit.push(message(conversation.id, MESSAGE_ROLE.TOOL, `${call.name}: intención ${intent.id} pendiente`));
          return this.finish(conversation, false, audit, confirmationPrompt(intent, intent.requiresPin), intent);
        }
        audit.push(message(conversation.id, MESSAGE_ROLE.TOOL, `${call.name}: ${outcome.isError ? `error: ${outcome.content}` : "ok"}`));
        results.push({ toolCallId: call.id, content: outcome.content, isError: outcome.isError });
      }
      messages.push({ role: "tool_results", results });
    }
    return this.escalate(conversation, isNew, audit, NOT_UNDERSTOOD_REPLY);
  }

  private newIntent(conversationId: string, viewer: Viewer, payload: IntentPayload): Intent {
    return {
      ...payload,
      id: randomUUID(),
      conversationId,
      userId: viewer.id,
      summary: summarize(payload),
      requiresPin: requiresPin(payload.type),
      status: INTENT_STATUS.PENDING,
      createdAt: new Date(),
      decidedAt: null,
      decidedBy: null,
      result: null,
    };
  }

  private async escalate(conversation: Conversation, isNew: boolean, audit: Message[], reply: string): Promise<Reply> {
    const flagged = { ...conversation, needsTechnician: true };
    const result = await this.finish(flagged, isNew, audit, reply, null);
    await this.store.flagTechnician(conversation.id);
    return result;
  }

  private async finish(conversation: Conversation, isNew: boolean, audit: Message[], reply: string, intent: Intent | null): Promise<Reply> {
    await this.saveConversation(conversation, isNew);
    await this.store.appendMessages([...audit, message(conversation.id, MESSAGE_ROLE.ASSISTANT, reply)]);
    return { conversation, reply, intent };
  }

  private async saveConversation(conversation: Conversation, isNew: boolean) {
    if (isNew && !(await this.store.findConversation(conversation.id))) await this.store.createConversation(conversation);
  }

  private async owned(viewer: Viewer, id: string) {
    const conversation = await this.store.findConversation(id);
    if (!conversation || conversation.userId !== viewer.id) throw new NotFoundError(`Conversation ${id} not found`);
    return conversation;
  }

  private async latestPending(conversationId: string) {
    const now = new Date();
    return (await this.store.listIntents(conversationId)).filter((i) => i.status === INTENT_STATUS.PENDING && !isExpired(i, now)).at(-1) ?? null;
  }
}
