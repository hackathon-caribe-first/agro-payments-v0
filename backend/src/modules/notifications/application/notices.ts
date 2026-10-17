// RF-37: domain events → notices in simple words (PRD «Recibir avisos»). Deterministic templates, never an LLM. Pure.
import type { DomainEvent } from "../../../shared/events/domain-events";
import { formatPesos } from "../../assistant/application/templates";

export type NoticeKind =
  | "project_activated"
  | "payment_done"
  | "milestone_approved"
  | "milestone_observed"
  | "evidence_logged"
  | "evidence_submitted"
  | "settlement_executed"
  | "assistant_escalated";

export type Recipient = { userId: string } | { role: string };

export type Notice = {
  recipient: Recipient;
  kind: NoticeKind;
  title: string;
  body: string;
  projectId: string | null;
  milestoneId: string | null;
  payload: Record<string, unknown>;
  /** Also said by the assistant in the recipient's conversation (producer notices). */
  viaAssistant: boolean;
};

/** The project a notice is about; null when the event has none or it no longer exists. */
export type NoticeProject = { id: string; title: string; ownerUserId: string };

// Who verifies and who answers escalations. ponytail: no «técnico» role exists yet; the operator (admin) takes the call.
export const VERIFIER_ROLE = "verifier";
export const TECHNICIAN_ROLE = "admin";

const REASON_MAX = 280;
// Words a verifier writes → words a producer uses. Applied in order, whole words, case-insensitive.
const PLAIN_WORDS: [RegExp, string][] = [
  [/\bgeorreferenciad[oa]s?\b/gi, "con la ubicación"],
  [/\bes ilegible\b/gi, "no se ve bien"],
  [/\bilegibles?\b/gi, "que no se ve bien"],
  [/\binconsistentes?\b/gi, "que no coincide"],
  [/\bpolígono\b/gi, "lote"],
  [/\bsubsanar\b/gi, "corregir"],
  [/\bsubsanación\b/gi, "corrección"],
  [/\bevidencia\b/gi, "prueba"],
];

/** The verifier's reason as the producer will read it: no jargon, no leading «falta», short. */
export function plainReason(reason: string | null): string {
  let text = (reason ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  if (text === "") return "el verificador pidió revisar la evidencia";
  for (const [word, plain] of PLAIN_WORDS) text = text.replace(word, plain);
  text = text.replace(/^faltan?\s+/i, "");
  text = text.charAt(0).toLowerCase() + text.slice(1);
  return text.length > REASON_MAX ? `${text.slice(0, REASON_MAX)}…` : text;
}

const pesos = (amount: number, assetScale: number) => formatPesos(Math.round(amount / 10 ** assetScale));
const photos = (n: number) => (n === 0 ? "sin fotos" : n === 1 ? "1 foto" : `${n} fotos`);

export function noticesFor(event: DomainEvent, project: NoticeProject | null): Notice[] {
  if (event.type === "assistant.escalated") {
    return [
      {
        recipient: { role: TECHNICIAN_ROLE },
        kind: "assistant_escalated",
        title: "Un productor necesita ayuda",
        body: `El asistente no pudo ayudar a un productor. Su último mensaje: «${event.lastUserMessage}». Llámelo.`,
        projectId: null,
        milestoneId: null,
        payload: { userId: event.userId, conversationId: event.conversationId },
        viaAssistant: false,
      },
    ];
  }
  if (!project) return [];
  const producer = (kind: NoticeKind, title: string, body: string, milestoneId: string | null = null, payload: Record<string, unknown> = {}): Notice[] => [
    { recipient: { userId: project.ownerUserId }, kind, title, body, projectId: project.id, milestoneId, payload, viaAssistant: true },
  ];

  switch (event.type) {
    case "project.funded":
      return producer("project_activated", "Proyecto activado", `Su proyecto «${project.title}» quedó activo: la plata ya está en custodia y puede empezar el primer hito.`);
    case "line.paid": {
      const amount = pesos(event.amount, event.assetScale);
      if (event.kind === "productor" || event.kind === "trabajadores") {
        return producer("payment_done", "Pago hecho", `Le llegaron ${amount} de jornales del hito «${event.milestoneTitle}».`, event.milestoneId, { lineId: event.lineId });
      }
      if (event.kind === "proveedor") {
        return producer(
          "payment_done",
          "Pago hecho",
          `Se le pagaron ${amount} a ${event.beneficiary} por los insumos del hito «${event.milestoneTitle}».`,
          event.milestoneId,
          { lineId: event.lineId },
        );
      }
      return [];
    }
    case "milestone.approved":
      return producer(
        "milestone_approved",
        "Hito aprobado",
        `El verificador aprobó el hito «${event.milestoneTitle}». Los pagos de este hito salen ahora y se abre el siguiente.`,
        event.milestoneId,
      );
    case "milestone.observed":
      return producer(
        "milestone_observed",
        "Hito con observaciones",
        `El verificador revisó el hito «${event.milestoneTitle}» y falta algo: ${plainReason(event.reason)}. Corríjalo y mande la evidencia otra vez; la plata sigue segura en custodia.`,
        event.milestoneId,
        { reason: event.reason },
      );
    case "evidence.recorded": {
      const where = event.location ? `con ubicación ${event.location.latitude}, ${event.location.longitude}` : "sin ubicación";
      const submitted = event.stage === "submitted";
      return [
        {
          recipient: { role: VERIFIER_ROLE },
          kind: submitted ? "evidence_submitted" : "evidence_logged",
          title: submitted ? "Hito para revisar" : "Nueva evidencia",
          body: submitted
            ? `El hito «${event.milestoneTitle}» de «${project.title}» se envió a revisión: ${photos(event.photoCount)}, ${where}.`
            : `Nueva evidencia en el hito «${event.milestoneTitle}» de «${project.title}»: ${photos(event.photoCount)}, ${where}.`,
          projectId: project.id,
          milestoneId: event.milestoneId,
          payload: { photoCount: event.photoCount, location: event.location },
          viaAssistant: false,
        },
      ];
    }
    case "settlement.executed":
      return producer(
        "settlement_executed",
        "Cosecha liquidada",
        `La cosecha de «${project.title}» quedó liquidada. Lo que le corresponde ya salió a su billetera.`,
        null,
        { settlementId: event.settlementId },
      );
  }
}
