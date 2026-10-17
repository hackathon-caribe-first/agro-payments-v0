// The language model behind the assistant, one request at a time. The use case runs the tool loop itself so it decides
// what reaches the model (never the PIN) and when a money-effect intent stops the turn.

export type ToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> };
export type ToolCall = { id: string; name: string; input: unknown };
export type ToolResult = { toolCallId: string; content: string; isError: boolean };

export type ModelMessage =
  | { role: "user"; text: string }
  /** `raw`: the model's own content blocks (thinking included), echoed back unchanged inside one tool loop. */
  | { role: "assistant"; text: string; raw?: unknown }
  | { role: "tool_results"; results: ToolResult[] };

export type ModelRequest = { system: string; tools: ToolDefinition[]; messages: ModelMessage[] };

/**
 * answer: a final text reply. tool_calls: run them and continue. refusal: the model (and its fallback) declined.
 * truncated: cut at max_tokens or the context window. unsupported: any other stop the loop cannot continue from.
 */
export type ModelOutcome = "answer" | "tool_calls" | "refusal" | "truncated" | "unsupported";
export type ModelTurn = { outcome: ModelOutcome; text: string; toolCalls: ToolCall[]; raw: unknown };

/** Thrown when no model is configured (no ANTHROPIC_API_KEY); the controller answers 503. */
export class AssistantUnavailableError extends Error {
  constructor() {
    super("El asistente no está disponible en este momento. Intente más tarde o use las pantallas de la aplicación.");
  }
}

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class AssistantModel {
  abstract next(request: ModelRequest): Promise<ModelTurn>;
}
