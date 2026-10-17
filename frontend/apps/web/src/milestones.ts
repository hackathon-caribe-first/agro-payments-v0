import { redirectDocument } from "react-router";
import { api, type Milestone } from "@agro/shared/api/client";

export async function loadMilestones() {
  const { data, error, response } = await api.GET("/milestones");
  if (response?.status === 401) throw new Response("Inicia sesión para ver los hitos", { status: 401 });
  if (response?.status === 403) throw new Response("Tu rol no puede ver los hitos", { status: 403 });
  if (error || !data) throw new Response("No se pudieron cargar los hitos", { status: 502 });
  return data;
}

export const SERVER_UNREACHABLE =
  "No pudimos conectar con el servidor de pagos. Revisa que el servidor esté en ejecución e inténtalo de nuevo.";

// Same load, but an unreachable/failing backend becomes data (rendered in-page) instead of the generic error view.
// Auth answers (401/403) keep throwing: they belong to the layout error view.
export async function loadMilestonesOrError(): Promise<{ milestones: Milestone[]; error: null } | { milestones: null; error: string }> {
  try {
    return { milestones: await loadMilestones(), error: null };
  } catch (e) {
    if (e instanceof Response && (e.status === 401 || e.status === 403)) throw e;
    return { milestones: null, error: SERVER_UNREACHABLE };
  }
}

export type ActionResult = { error: string } | { ok: true };

const OFFLINE: ActionResult = { error: "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo." };

function failure(status: number): ActionResult {
  if (status === 401) return { error: "Inicia sesión para continuar." };
  if (status === 403) return { error: "Tu rol no puede realizar esta acción." };
  if (status === 409) return { error: "Esta acción ya no aplica al hito. Recarga para ver su estado actual." };
  if (status === 400) return { error: "Revisa los datos: falta información obligatoria." };
  return { error: `El servidor respondió ${status}. Intenta de nuevo.` };
}

// The milestone grant leaves the app: the fiduciaria approves it in the custody wallet, which redirects back to /custodian.
async function startFunding(id: string): Promise<ActionResult | Response> {
  try {
    const { data, error, response } = await api.POST("/milestones/{id}/funding", { params: { path: { id } } });
    // redirectDocument + absolute URL: a full page load, never a client-side navigation.
    if (data) return redirectDocument(data.redirectUrl);
    if (response.status === 409) {
      // The custody refusals (not funded yet, balance below the milestone) are written for the user; the RF-13 grant-order ones
      // carry internal ids, so they keep the summary below.
      const message = (error as { message?: unknown } | undefined)?.message;
      if (typeof message === "string" && /custodia/i.test(message)) return { error: message };
      // RF-13: one live grant per project, and the next one only after the previous milestone closed.
      return { error: "Otro hito del proyecto tiene un grant vivo, o el hito anterior aún no está aprobado y cerrado." };
    }
    return failure(response.status);
  } catch {
    return OFFLINE;
  }
}

// One action for every role: the form says which transition it wants.
export async function milestoneAction(request: Request): Promise<ActionResult | Response> {
  const form = await request.formData();
  const params = { path: { id: String(form.get("id")) } };
  const text = (name: string) => String(form.get(name) ?? "");
  if (form.get("intent") === "fund") return startFunding(params.path.id);

  try {
    const { response } = await (() => {
      switch (form.get("intent")) {
        case "evidence":
          return api.POST("/milestones/{id}/evidence", { params, body: { description: text("description") } });
        case "approve":
          return api.POST("/milestones/{id}/review", { params, body: { decision: "approved" } });
        case "observe":
          return api.POST("/milestones/{id}/review", { params, body: { decision: "observado", reason: text("reason") } });
        case "pay-line":
          return api.POST("/milestones/{id}/lines/{lineId}/payment", {
            params: { path: { id: params.path.id, lineId: text("lineId") } },
          });
        case "sync":
          return api.POST("/milestones/{id}/lines/sync", { params });
        default:
          throw new Error("Unknown intent");
      }
    })();
    return response.ok ? { ok: true } : failure(response.status);
  } catch {
    return OFFLINE;
  }
}
