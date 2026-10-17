import { API_BASE_URL, API_SOURCE, transport } from "~/platform/transport";

// Producer assistant over /api/assistant (backend AssistantController). Same transport and base URL as the producer module.
// ponytail: plain fetch wrappers, no shared/typed client yet; the mock transport has no assistant, so it needs the http source.
export const ASSISTANT_NEEDS_SERVER = API_SOURCE !== "http";
const BASE = ((API_BASE_URL as string | undefined) ?? "/api").replace(/\/$/, "");

export type AssistantIntent = {
  id: string;
  type: "DRAFT_PROJECT" | "MILESTONE_EVIDENCE" | "ORDER_LINE";
  status: "pending" | "confirmed" | "rejected" | "expired";
  summary: string;
  requires_pin: boolean;
};
export type AssistantReply = { conversation_id: string; reply: string; needs_technician: boolean; intent?: AssistantIntent };
export type IntentDecision = AssistantIntent & { reply: string };
export type PinStatus = { pin_set: boolean; locked: boolean };

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

const FALLBACK_ERRORS: Record<number, string> = {
  503: "El asistente no está disponible en este momento. Intente más tarde.",
  401: "Inicie sesión para usar el asistente.",
  403: "El asistente es solo para productores.",
};

// The /api error body is { error, errors: { [field]: string[] } }; the first field message is the actionable one.
async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string; errors?: Record<string, string[]> } | null;
  const field = body?.errors ? Object.values(body.errors).flat()[0] : undefined;
  return field ?? FALLBACK_ERRORS[response.status] ?? body?.error ?? "No pudimos completar la solicitud. Intente de nuevo.";
}

async function request<T>(path: string, init?: { method: string; body?: unknown }): Promise<Result<T>> {
  try {
    const response = await transport(`${BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) return { ok: false, message: await readError(response) };
    return { ok: true, value: (response.status === 204 ? undefined : await response.json()) as T };
  } catch {
    return { ok: false, message: "Sin conexión con el servidor. Revise su señal e intente de nuevo." };
  }
}

export const assistant = {
  send: (text: string, conversationId: string | null) =>
    request<AssistantReply>("/assistant/messages", { method: "POST", body: { text, ...(conversationId && { conversation_id: conversationId }) } }),
  // The PIN goes only here, straight to the confirm endpoint; it is never part of a chat message.
  confirm: (intentId: string, pin?: string) =>
    request<IntentDecision>(`/assistant/intents/${encodeURIComponent(intentId)}/confirm`, { method: "POST", body: pin ? { pin } : {} }),
  reject: (intentId: string) => request<IntentDecision>(`/assistant/intents/${encodeURIComponent(intentId)}/reject`, { method: "POST", body: {} }),
  pinStatus: () => request<PinStatus>("/assistant/pin"),
  setPin: (pin: string) => request<void>("/assistant/pin", { method: "PUT", body: { pin } }),
};
