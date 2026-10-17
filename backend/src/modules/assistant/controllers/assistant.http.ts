// /api/assistant wire shapes (snake_case, like the projects controllers) and the 503 for a missing model.
import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { FORM_LEVEL_KEY, ValidationError } from "../../../shared/domain-errors";
import type { Conversation, Intent, Message } from "../application/assistant";
import { AssistantUnavailableError } from "../ports/assistant-model";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const malformed = () => new ValidationError({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] }, "Invalid request shape");

export function parseMessageRequest(body: unknown) {
  if (!isObject(body)) throw malformed();
  return { conversationId: body.conversation_id, text: body.text };
}

export function parseConfirmRequest(body: unknown) {
  return { pin: isObject(body) ? body.pin : undefined };
}

export function parsePinRequest(body: unknown) {
  if (!isObject(body)) throw malformed();
  return { pin: body.pin, currentPin: body.current_pin };
}

// The PIN is never echoed: intents carry the code-rendered summary, not the confirmation input.
export const toIntentResponse = (i: Intent) => ({
  id: i.id,
  type: i.type,
  status: i.status,
  summary: i.summary,
  requires_pin: i.requiresPin,
  created_at: i.createdAt.toISOString(),
  decided_at: i.decidedAt?.toISOString() ?? null,
  result: i.result,
});

export const toReplyResponse = (r: { conversation: Conversation; reply: string; intent: Intent | null }) => ({
  conversation_id: r.conversation.id,
  reply: r.reply,
  needs_technician: r.conversation.needsTechnician,
  ...(r.intent && { intent: toIntentResponse(r.intent) }),
});

export const toDecisionResponse = (d: { intent: Intent; reply: string }) => ({ ...toIntentResponse(d.intent), reply: d.reply });

export const toConversationResponse = (c: { conversation: Conversation; messages: Message[]; intents: Intent[] }) => ({
  id: c.conversation.id,
  needs_technician: c.conversation.needsTechnician,
  created_at: c.conversation.createdAt.toISOString(),
  messages: c.messages.map((m) => ({ id: m.id, role: m.role, text: m.text, created_at: m.createdAt.toISOString() })),
  intents: c.intents.map(toIntentResponse),
});

type HttpResponse = { status(code: number): { json(body: unknown): void } };

/** No ANTHROPIC_API_KEY: 503 with the /api error body, so the chat shows the message and nothing else breaks. */
@Catch(AssistantUnavailableError)
export class AssistantUnavailableFilter implements ExceptionFilter {
  catch(error: AssistantUnavailableError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<HttpResponse>().status(503).json({ error: error.message, errors: {} });
  }
}
