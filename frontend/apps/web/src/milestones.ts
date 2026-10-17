import { api } from "@agro/shared/api/client";

export async function loadMilestones() {
  const { data, error, response } = await api.GET("/milestones");
  if (response?.status === 401) throw new Response("Inicia sesión para ver los hitos", { status: 401 });
  if (response?.status === 403) throw new Response("Tu rol no puede ver los hitos", { status: 403 });
  if (error || !data) throw new Response("No se pudieron cargar los hitos", { status: 502 });
  return data;
}

export type ActionResult = { error: string } | { ok: true };

// One action for every role: the form says which transition it wants.
export async function milestoneAction(request: Request): Promise<ActionResult> {
  const form = await request.formData();
  const params = { path: { id: String(form.get("id")) } };
  const text = (name: string) => String(form.get(name) ?? "");

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
    if (response.ok) return { ok: true };
    if (response.status === 401) return { error: "Inicia sesión para continuar." };
    if (response.status === 403) return { error: "Tu rol no puede realizar esta acción." };
    if (response.status === 409) return { error: "Esta acción ya no aplica al hito. Recarga para ver su estado actual." };
    if (response.status === 400) return { error: "Revisa los datos: falta información obligatoria." };
    return { error: `El servidor respondió ${response.status}. Intenta de nuevo.` };
  } catch {
    return { error: "No pudimos conectar con el servidor de la demo. Revisa tu conexión e intenta de nuevo." };
  }
}
