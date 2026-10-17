import { API_BASE_URL, transport } from "~/platform/transport";

// Small typed fetch over the app transport for routes without a shared repository yet (support trace, notices, admission).
// ponytail: same shape as producer/assistant.ts; fold both into one client when the OpenAPI types cover these routes.
const BASE = ((API_BASE_URL as string | undefined) ?? "/api").replace(/\/$/, "");

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

const FALLBACK: Record<number, string> = {
  401: "Inicia sesión para ver esta información.",
  403: "Tu rol no puede ver esta información.",
  404: "No encontramos la información.",
};

export async function jsonRequest<T>(path: string, init?: { method: string; body?: unknown }): Promise<Result<T>> {
  try {
    const response = await transport(`${BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { errors?: Record<string, string[]> } | null;
      const field = body?.errors ? Object.values(body.errors).flat()[0] : undefined;
      return { ok: false, status: response.status, message: field ?? FALLBACK[response.status] ?? "No pudimos completar la solicitud. Intenta de nuevo." };
    }
    return { ok: true, value: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0, message: "Sin conexión con el servidor. Revisa tu señal e intenta de nuevo." };
  }
}
