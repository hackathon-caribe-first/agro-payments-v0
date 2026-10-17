import type { Milestone } from "@agro/shared/api/client";
import { type ActionResult, milestoneAction } from "~/milestones";

// Custody payouts (PRD v3 RF-13, RF-15/RF-16): order approval and supplier registry over /api.
// ponytail: these routes are not in the generated OpenAPI schema yet (`pnpm openapi` was not rerun), so they use plain fetch
// with the same base URL and session cookie as the typed client.
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type OrderApproval = "pending" | "approved" | "rejected";
export type Order = {
  id: string;
  milestone_id: string;
  supplier: string;
  product: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  approval: OrderApproval;
  line_id: string | null;
  reason: string | null;
};
export type Supplier = { id: string; name: string; wallet_address: string; asset_code: string };

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string | null }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.ok) return { ok: true, data: (await response.json()) as T };
  const error = (await response.json().catch(() => null)) as { error?: string; errors?: Record<string, string[]> } | null;
  const fieldMessage = error?.errors ? Object.values(error.errors).flat()[0] : undefined;
  return { ok: false, status: response.status, message: fieldMessage ?? null };
}

/** Orders per milestone; a role that cannot read them (or the server being down) just shows none. */
export async function loadOrders(milestones: Milestone[]): Promise<Record<string, Order[]>> {
  const entries = await Promise.all(
    milestones.map(async (m) => {
      const result = await call<Order[]>("GET", `/api/milestones/${encodeURIComponent(m.id)}/orders`).catch(() => null);
      return [m.id, result?.ok ? result.data : []] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function loadSuppliers(): Promise<Supplier[]> {
  const result = await call<Supplier[]>("GET", "/api/suppliers").catch(() => null);
  return result?.ok ? result.data : [];
}

const OFFLINE: ActionResult = { error: "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo." };

function failure(status: number, message: string | null, conflict: string): ActionResult {
  if (status === 401) return { error: "Inicia sesión para continuar." };
  if (status === 403) return { error: "Solo el operador o la fiduciaria pueden hacer esto." };
  if (status === 409) return { error: conflict };
  if (status === 400) return { error: message ?? "Revisa los datos: falta información obligatoria." };
  return { error: `El servidor respondió ${status}. Intenta de nuevo.` };
}

async function run(path: string, body: unknown, conflict: string): Promise<ActionResult> {
  try {
    const result = await call<unknown>("POST", path, body);
    return result.ok ? { ok: true } : failure(result.status, result.message, conflict);
  } catch {
    return OFFLINE;
  }
}

// The custodian screen's actions: orders and suppliers here, every milestone transition in milestoneAction.
export async function custodianAction(request: Request): Promise<ActionResult | Response> {
  const form = await request.clone().formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const order = (verb: "approve" | "reject") => `/api/milestones/${encodeURIComponent(text("id"))}/orders/${encodeURIComponent(text("orderId"))}/${verb}`;
  switch (form.get("intent")) {
    case "approve-order":
      return run(order("approve"), { supplier_id: text("supplierId") || undefined }, "La orden no cabe en el tope que le queda al hito, el proveedor no está registrado o ya se decidió.");
    case "reject-order":
      return run(order("reject"), { reason: text("reason") || undefined }, "Esta orden ya se decidió. Recarga para ver su estado.");
    case "register-supplier":
      return run("/api/suppliers", { name: text("name"), wallet_address: text("walletAddress") }, "Ya existe un proveedor con ese nombre.");
    default:
      return milestoneAction(request);
  }
}
