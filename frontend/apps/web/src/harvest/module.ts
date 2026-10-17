import { redirectDocument } from "react-router";
import { createHarvestModule } from "@agro/shared/modules/harvest/infrastructure/harvest-module";
import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import { API_BASE_URL, transport } from "~/platform/transport";

// RF-24 harvest, RF-21 custody and RF-27 investor panel over the same transport as the rest of the app.
export const harvest = createHarvestModule({ fetchFn: transport, baseUrl: API_BASE_URL });

export type HarvestActionData = { ok: true } | { ok: false; fieldErrors: FieldErrors };

export const HARVEST_INTENTS = ["declare-harvest", "certify-harvest", "pay-harvest", "receive-harvest"] as const;
export const isHarvestIntent = (intent: FormDataEntryValue | null) => (HARVEST_INTENTS as readonly unknown[]).includes(intent);

const OFFLINE = "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.";

// One action for every harvest form; the form says which step it wants and which project. Open Payments: the buyer approves the
// payment in their wallet (a full page load to the consent URL), which sends them back with ?harvest_payment=ok|error.
export async function harvestAction(form: FormData): Promise<HarvestActionData | Response> {
  const projectId = String(form.get("projectId") ?? "");
  const value = (name: string) => form.get(name) ?? "";
  const result = await (() => {
    switch (form.get("intent")) {
      case "declare-harvest":
        return harvest.declare(projectId, { quantityKg: value("quantityKg"), qualityGrade: value("qualityGrade"), evidence: value("evidence") });
      case "certify-harvest":
        return harvest.certify(projectId, { quantityKg: value("quantityKg"), qualityGrade: value("qualityGrade"), notes: value("notes"), pricePerKg: value("pricePerKg") });
      case "pay-harvest":
        return harvest.pay(projectId);
      default:
        return harvest.confirmReception(projectId);
    }
  })();
  if (!result.ok) {
    if (result.error.kind === "validation") return { ok: false, fieldErrors: result.error.fieldErrors };
    return { ok: false, fieldErrors: { [FORM_LEVEL_KEY]: [OFFLINE] } };
  }
  if (result.value.paymentRedirectUrl) return redirectDocument(result.value.paymentRedirectUrl);
  return { ok: true };
}
