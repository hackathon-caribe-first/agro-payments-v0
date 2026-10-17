// PRD "Determinismo donde importa": every reply about money, dates or names of an intent is rendered here from the
// tool payload, never written by the model. Plain string building (no Intl) so the output never depends on ICU data.
import { INTENT_TYPE, type IntentPayload, type IntentStatus } from "./assistant";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const PRODUCTION_LABELS: Record<string, string> = { CAFE_ESPECIAL: "Café especial", CACAO: "Cacao", AGUACATE_HASS: "Aguacate Hass", OTRO: "Otro cultivo" };

export const formatPesos = (pesos: number) => `$${String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

export function formatDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function summarize(intent: IntentPayload): string {
  switch (intent.type) {
    case INTENT_TYPE.ORDER_LINE: {
      const o = intent.data;
      return `Orden de compra para el hito «${o.milestoneTitle}»: ${o.quantity} ${o.unit} de ${o.product} a ${o.supplier}, a ${formatPesos(o.unitPrice)} cada uno, total ${formatPesos(o.total)}.`;
    }
    case INTENT_TYPE.DRAFT_PROJECT: {
      const p = intent.data;
      const milestones = p.milestones
        .map(
          (m, i) =>
            `${i + 1}) ${m.title}, para el ${formatDate(m.estimatedCompletionDate)}: insumos ${formatPesos(m.suppliesBudget)} y mano de obra ${formatPesos(m.laborBudget)}`,
        )
        .join("; ");
      const total = p.milestones.reduce((sum, m) => sum + m.suppliesBudget + m.laborBudget, 0);
      const type = PRODUCTION_LABELS[p.productionType] ?? p.productionType;
      return `Proyecto «${p.title}» (${type}), del ${formatDate(p.startDate)} al ${formatDate(p.estimatedEndDate)}. Hitos: ${milestones}. Total: ${formatPesos(total)}.`;
    }
    case INTENT_TYPE.MILESTONE_EVIDENCE: {
      const e = intent.data;
      const parts = [`Evidencia para el hito «${e.milestoneTitle}»: «${e.notes}».`];
      if (e.photoCount > 0) parts.push(`${plural(e.photoCount, "foto", "fotos")}.`);
      if (e.location) parts.push(`Ubicación ${e.location.latitude}, ${e.location.longitude}.`);
      return parts.join(" ");
    }
  }
}

export function confirmationPrompt(intent: IntentPayload, needsPin: boolean): string {
  const summary = summarize(intent);
  if (needsPin) {
    return `${summary}\n¿Está bien? Si es así, responda «sí» y escriba su PIN de 4 dígitos en la pantalla (nunca en el chat). El pago no sale hasta que el operador lo apruebe.`;
  }
  return `${summary}\n¿Está bien? Responda «sí» para guardarlo o «no» para cancelar.`;
}

export function decisionReply(intent: IntentPayload, status: IntentStatus, result: Record<string, unknown> | null): string {
  if (status !== "confirmed") return "Listo, cancelé la solicitud. No se hizo ningún cambio.";
  switch (intent.type) {
    case INTENT_TYPE.DRAFT_PROJECT:
      return `Listo. Creé el proyecto en borrador con el código ${String(result?.projectCode ?? "")}.`;
    case INTENT_TYPE.MILESTONE_EVIDENCE:
      return `Listo. Guardé la evidencia del hito «${intent.data.milestoneTitle}». El verificador la revisará cuando la envíe a revisión.`;
    case INTENT_TYPE.ORDER_LINE:
      return `Listo. Su orden por ${formatPesos(intent.data.total)} quedó confirmada y espera la aprobación del operador. Todavía no se ha pagado nada.`;
  }
}
