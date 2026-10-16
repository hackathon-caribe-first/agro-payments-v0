import type { Milestone } from "@agro/shared/api/client";

export type Tone = "neutral" | "warning" | "success" | "danger";
export type MilestoneState = { label: string; tone: Tone; symbol: string };

// Visible state per DESIGN.md §6: text + color + symbol, and approval is never shown as payment.
export function milestoneState(m: Milestone): MilestoneState {
  if (m.payment?.status === "confirmed") return { label: "Pago simulado confirmado", tone: "success", symbol: "✓" };
  if (m.payment?.status === "processing") return { label: "Pago en proceso", tone: "warning", symbol: "◷" };
  switch (m.status) {
    case "evidence_submitted":
      return { label: "Pendiente de verificación", tone: "warning", symbol: "◷" };
    case "approved":
      return { label: "Hito aprobado", tone: "success", symbol: "✓" };
    case "rejected":
      return { label: "Requiere corrección", tone: "danger", symbol: "✕" };
    default:
      return { label: "Sin enviar", tone: "neutral", symbol: "○" };
  }
}

const pesos = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function formatMoney(amount: number, currency: string) {
  return `${currency} ${pesos.format(amount)}`;
}
