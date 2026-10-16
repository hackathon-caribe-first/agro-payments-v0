import { api } from "@agro/shared/api/client";

export async function loadMilestones() {
  const { data, error } = await api.GET("/milestones");
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
        case "reject":
          return api.POST("/milestones/{id}/review", { params, body: { decision: "rejected", reason: text("reason") } });
        case "pay":
          return api.POST("/milestones/{id}/payment", { params });
        case "confirm":
          return api.POST("/milestones/{id}/payment/confirmation", { params });
        default:
          throw new Error("Unknown intent");
      }
    })();
    if (response.ok) return { ok: true };
    if (response.status === 409) return { error: "Esta acción ya no aplica al hito. Recarga para ver su estado actual." };
    if (response.status === 400) return { error: "Revisa los datos: falta información obligatoria." };
    return { error: `El servidor respondió ${response.status}. Intenta de nuevo.` };
  } catch {
    return { error: "No pudimos conectar con el servidor de la demo. Revisa tu conexión e intenta de nuevo." };
  }
}
