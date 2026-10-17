import type { Milestone } from "@agro/shared/api/client";
import { formatMoney, milestoneState } from "./milestone-state";

const base: Milestone = {
  id: "m1",
  title: "Siembra",
  amount: 6_000_000,
  currency: "COP",
  status: "draft",
  evidence: null,
  review: null,
  payment: null,
};
const payment = (status: "processing" | "confirmed") => ({
  status,
  reference: "SIM-1",
  shares: [],
  orderedAt: "2026-10-16T12:00:00Z",
  confirmedAt: null,
});

test.each([
  [base, "Sin enviar", "neutral"],
  [{ ...base, status: "evidence_submitted" }, "Pendiente de verificación", "warning"],
  [{ ...base, status: "approved" }, "Hito aprobado", "success"],
  [{ ...base, status: "rejected" }, "Requiere corrección", "danger"],
  [{ ...base, status: "approved", payment: payment("processing") }, "Pago en proceso", "warning"],
  [{ ...base, status: "approved", payment: payment("confirmed") }, "Pago confirmado", "success"],
] as const)("%#: shows «%s»", (milestone, label, tone) => {
  expect(milestoneState(milestone as Milestone)).toMatchObject({ label, tone });
});

test("a payment in process never shows a success check", () => {
  expect(milestoneState({ ...base, status: "approved", payment: payment("processing") }).symbol).not.toBe("✓");
});

test("formats whole pesos with the ISO code", () => {
  expect(formatMoney(6_000_000, "COP")).toBe("COP 6.000.000");
});
