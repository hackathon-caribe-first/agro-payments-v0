import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTool,
  BetaToolUseBlock,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { AssistantModel, type ModelMessage, type ModelOutcome, type ModelRequest, type ModelTurn } from "../ports/assistant-model";

export const MODEL_ID = "claude-opus-5-5";
/** Gates the `fallbacks: "default"` scalar form (the array form uses a different header). */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
// ponytail: one cap for every turn; replies are one or two sentences, adaptive thinking at low effort stays well under it.
const MAX_TOKENS = 8000;

/** The one SDK call this adapter makes; the Anthropic client satisfies it, specs pass a recorder. */
export type MessagesClient = { beta: { messages: { create(body: MessageCreateParamsNonStreaming): Promise<BetaMessage> } } };

// Claude Opus 5.5 over the Messages API (beta surface, for server-side fallbacks). Thinking is always on and adaptive on this
// model: no `thinking` config (disabled 400s), depth set by effort low for chat latency (RNF-08), and tool_choice left auto
// (forced choice 400s). On a policy decline the API retries on Anthropic's default fallback model inside the same call.
export class AnthropicAssistantModel extends AssistantModel {
  constructor(private readonly client: MessagesClient) {
    super();
  }

  async next(request: ModelRequest): Promise<ModelTurn> {
    const response = await this.client.beta.messages.create({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      // Tools render before system, so one breakpoint here caches tools + the frozen system prompt.
      system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
      tools: request.tools.map((t): BetaTool => ({ name: t.name, description: t.description, input_schema: t.inputSchema as BetaTool["input_schema"], strict: true })),
      messages: request.messages.map(toParam),
    });
    return toTurn(response);
  }
}

function toParam(message: ModelMessage): BetaMessageParam {
  switch (message.role) {
    case "user":
      return { role: "user", content: message.text };
    case "assistant":
      // Inside one tool loop the model's blocks go back verbatim (thinking is bound to them); earlier turns are plain text.
      return { role: "assistant", content: message.raw === undefined ? message.text : (message.raw as BetaContentBlockParam[]) };
    case "tool_results":
      return {
        role: "user",
        content: message.results.map((r) => ({ type: "tool_result", tool_use_id: r.toolCallId, content: r.content, is_error: r.isError })),
      };
  }
}

const OUTCOMES: Record<string, ModelOutcome> = {
  end_turn: "answer",
  stop_sequence: "answer",
  tool_use: "tool_calls",
  refusal: "refusal",
  max_tokens: "truncated",
  model_context_window_exceeded: "truncated",
};

// stop_reason first: a refusal or a truncated turn can carry partial text or a cut tool_use that must never be used.
function toTurn(response: BetaMessage): ModelTurn {
  const outcome = OUTCOMES[response.stop_reason ?? ""] ?? "unsupported";
  if (outcome !== "answer" && outcome !== "tool_calls") return { outcome, text: "", toolCalls: [], raw: response.content };
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const toolCalls = response.content
    .filter((b): b is BetaToolUseBlock => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
  return { outcome, text, toolCalls: outcome === "tool_calls" ? toolCalls : [], raw: response.content };
}
