import type { Milestone } from "@agro/shared/api/client";

export type Tone = "neutral" | "warning" | "success" | "danger";
export type MilestoneState = { label: string; tone: Tone; symbol: string };

// Visible state per DESIGN.md §6: text + color + symbol, and approval is never shown as payment.
export function milestoneState(m: Milestone): MilestoneState {
  if (m.closedAt) {
    return m.lines.some((l) => l.status === "fallido")
      ? { label: "Cerrado con pagos fallidos", tone: "danger", symbol: "✕" }
      : { label: "Hito cerrado", tone: "success", symbol: "✓" };
  }
  if (m.lines.some((l) => l.status === "en_cola")) return { label: "Pago en cola", tone: "warning", symbol: "◷" };
  switch (m.status) {
    case "evidence_submitted":
      return { label: "Pendiente de verificación", tone: "warning", symbol: "◷" };
    case "approved":
      return { label: "Hito aprobado", tone: "success", symbol: "✓" };
    case "observado":
      return { label: "Observado: requiere corrección", tone: "danger", symbol: "✕" };
    default:
      return { label: "Sin enviar", tone: "neutral", symbol: "○" };
  }
}

// Amounts are integer minor units: split them as digits so large values never go through floating point.
// `scale` defaults to 0 (whole units, e.g. presale/negotiation pesos); non-integers are rounded like the former formatter did.
export function formatMoney(amount: number, currency: string, scale = 0) {
  const negative = amount < 0;
  const digits = String(Math.abs(Math.round(amount))).padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  const hasFraction = /[1-9]/.test(fraction);
  // ponytail: es-CO decimal comma hardcoded, use formatToParts if other locales appear
  const grouped = new Intl.NumberFormat("es-CO").format(BigInt(whole));
  return `${currency} ${negative ? "-" : ""}${hasFraction ? `${grouped},${fraction}` : grouped}`;
}
