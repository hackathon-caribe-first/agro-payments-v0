import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { SYSTEM_PROMPT } from "../application/system-prompt";
import { TOOL_DEFINITIONS } from "../application/tools";
import type { ModelRequest } from "../ports/assistant-model";
import { AnthropicAssistantModel, FALLBACK_BETA, MODEL_ID } from "./anthropic-assistant-model.adapter";

// No network: the SDK client is replaced by a recorder of the request bodies it would send.
function recorder(response: Partial<BetaMessage>) {
  const bodies: MessageCreateParamsNonStreaming[] = [];
  const client = {
    beta: {
      messages: {
        create: async (body: MessageCreateParamsNonStreaming) => {
          bodies.push(structuredClone(body));
          return { content: [], stop_reason: "end_turn", ...response } as BetaMessage;
        },
      },
    },
  };
  return { bodies, model: new AnthropicAssistantModel(client) };
}

const thinking = { type: "thinking", thinking: "", signature: "sig" };
const toolUse = { type: "tool_use", id: "toolu_1", name: "consultar_estado", input: {} };
const request: ModelRequest = {
  system: SYSTEM_PROMPT,
  tools: TOOL_DEFINITIONS,
  messages: [
    { role: "user", text: "Hola" },
    { role: "assistant", text: "¿En qué le ayudo?" },
    { role: "user", text: "¿Cuánto me falta?" },
    { role: "assistant", text: "", raw: [thinking, toolUse] },
    { role: "tool_results", results: [{ toolCallId: "toolu_1", content: "Proyecto AGR-2026-001", isError: false }] },
  ],
};

describe("AnthropicAssistantModel request", () => {
  it("uses Claude Opus 5.5 at low effort with the default server-side refusal fallback", async () => {
    const { bodies, model } = recorder({});
    await model.next(request);
    const [body] = bodies;
    expect(body.model).toBe(MODEL_ID);
    expect(MODEL_ID).toBe("claude-opus-5-5");
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.fallbacks).toBe("default");
    expect(body.betas).toEqual([FALLBACK_BETA]);
    expect(FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
    // Adaptive thinking is the default on this model: no thinking config (disabled is a 400) and no forced tool choice (400).
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("tool_choice");
  });

  it("caches a frozen system prompt and sends the four tools strict, in order", async () => {
    const { bodies, model } = recorder({});
    await model.next(request);
    const [body] = bodies;
    expect(body.system).toEqual([{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    expect(body.tools?.map((t) => ("name" in t ? t.name : null))).toEqual(["consultar_estado", "crear_borrador_proyecto", "crear_evidencia_hito", "crear_linea_orden"]);
    for (const tool of body.tools ?? []) {
      expect(tool).toMatchObject({ strict: true, input_schema: { type: "object", additionalProperties: false } });
    }
  });

  it("maps history as text, echoes the loop's raw blocks unchanged and sends tool results", async () => {
    const { bodies, model } = recorder({});
    await model.next(request);
    expect(bodies[0].messages).toEqual([
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¿En qué le ayudo?" },
      { role: "user", content: "¿Cuánto me falta?" },
      { role: "assistant", content: [thinking, toolUse] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "Proyecto AGR-2026-001", is_error: false }] },
    ]);
  });
});

describe("AnthropicAssistantModel response", () => {
  it("checks stop_reason before reading content: a refusal is a refusal even with partial text", async () => {
    const { model } = recorder({ stop_reason: "refusal", content: [{ type: "text", text: "Claro, aquí", citations: null }] });
    expect(await model.next(request)).toMatchObject({ outcome: "refusal", toolCalls: [] });
  });

  it("treats max_tokens and a full context window as truncated, never running a cut tool call", async () => {
    for (const stop_reason of ["max_tokens", "model_context_window_exceeded"] as const) {
      const { model } = recorder({ stop_reason, content: [toolUse] as BetaMessage["content"] });
      expect(await model.next(request)).toMatchObject({ outcome: "truncated", toolCalls: [] });
    }
  });

  it("returns tool calls with the raw content to echo back, and joins text for an answer", async () => {
    const calls = recorder({ stop_reason: "tool_use", content: [thinking, toolUse] as BetaMessage["content"] });
    expect(await calls.model.next(request)).toEqual({ outcome: "tool_calls", text: "", toolCalls: [{ id: "toolu_1", name: "consultar_estado", input: {} }], raw: [thinking, toolUse] });

    const text = recorder({ stop_reason: "end_turn", content: [thinking, { type: "text", text: "Le faltan dos hitos.", citations: null }] as BetaMessage["content"] });
    expect(await text.model.next(request)).toMatchObject({ outcome: "answer", text: "Le faltan dos hitos." });

    const paused = recorder({ stop_reason: "pause_turn" });
    expect((await paused.model.next(request)).outcome).toBe("unsupported");
  });
});
