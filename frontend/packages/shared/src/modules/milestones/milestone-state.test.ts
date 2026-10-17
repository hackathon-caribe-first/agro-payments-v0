import type { Milestone } from "@agro/shared/api/client";
import { formatMoney, formatRate, milestoneState } from "./milestone-state";

type Line = Milestone["lines"][number];

const line = (id: string, status: Line["status"]): Line => ({
  id,
  kind: "proveedor",
  beneficiary: "Proveedor",
  walletAddress: "https://wallet.test/prov",
  amount: 100,
  status,
  reference: null,
  settledAt: null,
  receipt: null,
});

const base: Milestone = {
  id: "m1",
  title: "Siembra",
  amount: 600_000_000,
  currency: "COP",
  assetScale: 2,
  status: "draft",
  evidence: null,
  review: null,
  lines: [line("a", "pendiente")],
  fundedAt: null,
  closedAt: null,
};
const closedAt = "2026-10-16T12:00:00Z";

test.each([
  [base, "Sin enviar", "neutral"],
  [{ ...base, status: "evidence_submitted" }, "Pendiente de verificación", "warning"],
  [{ ...base, status: "approved" }, "Hito aprobado", "success"],
  [{ ...base, status: "observado" }, "Observado: requiere corrección", "danger"],
  [{ ...base, status: "approved", lines: [line("a", "completado"), line("b", "en_cola")] }, "Pago en cola", "warning"],
  [{ ...base, status: "approved", closedAt, lines: [line("a", "completado"), line("b", "completado")] }, "Hito cerrado", "success"],
  [{ ...base, status: "approved", closedAt, lines: [line("a", "completado"), line("b", "fallido")] }, "Cerrado con pagos fallidos", "danger"],
] as const)("%#: shows «%s»", (milestone, label, tone) => {
  expect(milestoneState(milestone as Milestone)).toMatchObject({ label, tone });
});

test("a queued payment never shows a success check", () => {
  const queued = { ...base, status: "approved", lines: [line("a", "en_cola")] } as Milestone;
  expect(milestoneState(queued).symbol).not.toBe("✓");
});

describe("formatMoney", () => {
  test("splits integer minor units by the asset scale, hiding a zero fraction", () => {
    expect(formatMoney(600_000_000, "COP", 2)).toBe("COP 6.000.000");
  });

  test("keeps the full fraction when it is not zero", () => {
    expect(formatMoney(123_450, "COP", 2)).toBe("COP 1.234,50");
    expect(formatMoney(5, "COP", 2)).toBe("COP 0,05");
  });

  test("works with a scale of 0 and with large safe integers exactly", () => {
    expect(formatMoney(6_000_000, "COP", 0)).toBe("COP 6.000.000");
    expect(formatMoney(9_007_199_254_740_991, "COP", 2)).toBe("COP 90.071.992.547.409,91");
  });
});

describe("formatRate", () => {
  it("renders a reduced ratio as an es-CO decimal, grouping the whole part", () => {
    expect(formatRate("4100/1")).toBe("4.100");
    expect(formatRate("1/2")).toBe("0,5");
  });

  it("truncates to four decimals with BigInt digits, never floats", () => {
    expect(formatRate("300/301")).toBe("0,9966");
    expect(formatRate("12345678901234567890/3")).toBe("4.115.226.300.411.522.630");
  });

  it("returns null for anything that is not a positive ratio", () => {
    expect(formatRate("abc")).toBeNull();
    expect(formatRate("1/0")).toBeNull();
  });
});
