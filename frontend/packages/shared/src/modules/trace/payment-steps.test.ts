import { groupPaymentSteps, paymentStepLabel, shortenUrl, toPaymentStepRows, toPaymentStepsView, toProjectOptions } from "./domain/payment-steps";
import { loadPaymentSteps } from "./application/use-cases";
import { HttpPaymentStepsRepository } from "./infrastructure/http-payment-steps-repository";

const row = (overrides: Record<string, unknown> = {}) => ({
  payment_kind: "buyer_deposit",
  payment_id: "neg-1",
  step: "grant_requested",
  at: "2026-10-17T10:00:00.000Z",
  op_url: null,
  detail: null,
  project_id: "p1",
  ...overrides,
});

describe("payment-steps timeline (RF-20, real backend)", () => {
  it("groups rows per payment, orders steps oldest first and measures the seconds since the previous step", () => {
    const rows = toPaymentStepRows([
      row({ step: "incoming_created", at: "2026-10-17T10:00:05.000Z", op_url: "https://wallet.example/alice/incoming-payments/abc" }),
      row({ step: "grant_requested", at: "2026-10-17T10:00:00.000Z" }),
      row({ payment_kind: "milestone_line", payment_id: "line-1", step: "grant_requested", at: "2026-10-17T09:00:00.000Z" }),
      row({ step: "completed", at: "2026-10-17T10:01:35.000Z", detail: { amount: "100" } }),
    ]);

    const [deposit, line] = groupPaymentSteps(rows);

    expect(deposit).toMatchObject({ kind: "buyer_deposit", paymentId: "neg-1", projectId: "p1", outcome: "completed" });
    expect(deposit!.steps.map((s) => [s.step, s.elapsedSeconds])).toEqual([
      ["grant_requested", null],
      ["incoming_created", 5],
      ["completed", 90],
    ]);
    expect(deposit!.steps[2]!.detail).toEqual({ amount: "100" });
    expect(line).toMatchObject({ kind: "milestone_line", paymentId: "line-1", outcome: "in_progress" });
  });

  it("reports a failed final state", () => {
    const [payment] = groupPaymentSteps(toPaymentStepRows([row(), row({ step: "failed", at: "2026-10-17T10:00:02.000Z" })]));
    expect(payment!.outcome).toBe("failed");
  });

  it("tolerates unknown kinds and steps (raw value shown) and drops malformed rows", () => {
    const rows = toPaymentStepRows([row({ payment_kind: "royalty_payout", step: "teleported" }), { step: "completed" }, null, "x"]);
    expect(rows).toHaveLength(1);
    const [payment] = groupPaymentSteps(rows);
    expect(payment).toMatchObject({ kind: "royalty_payout", outcome: "in_progress" });
    expect(paymentStepLabel("teleported")).toBe("teleported");
    expect(paymentStepLabel("sent_unconfirmed")).toBe("Enviado, falta confirmar");
    expect(toPaymentStepRows({ not: "an array" })).toEqual([]);
  });

  it("filters by project and kind while keeping the options and the total from every payment", () => {
    const rows = toPaymentStepRows([row(), row({ payment_kind: "harvest_payment", payment_id: "h-1", project_id: "p2" })]);
    const view = toPaymentStepsView(rows, { projectId: "p2" });
    expect(view).toMatchObject({ total: 2, kinds: ["buyer_deposit", "harvest_payment"] });
    expect(view.projects).toEqual([
      { id: "p1", label: "p1" },
      { id: "p2", label: "p2" },
    ]);
    expect(view.payments.map((p) => p.paymentId)).toEqual(["h-1"]);
    expect(toPaymentStepsView(rows, { kind: "buyer_deposit" }).payments.map((p) => p.paymentId)).toEqual(["neg-1"]);
  });

  it("lists every project by title, even those without payments, and keeps unlisted ids from the rows", () => {
    const projects = toProjectOptions([
      { id: "p1", title: "Café Castillo", project_code: "AGR-2026-001" },
      { id: "p3", title: "", project_code: "AGR-2026-003" },
      { id: "p4" },
      { title: "sin id" },
    ]);
    expect(projects).toEqual([
      { id: "p1", label: "Café Castillo" },
      { id: "p3", label: "AGR-2026-003" },
      { id: "p4", label: "p4" },
    ]);
    const rows = toPaymentStepRows([row(), row({ payment_id: "neg-2", project_id: "p2" })]);
    const view = toPaymentStepsView(rows, {}, projects);
    expect(view.projects.map((p) => [p.id, p.label])).toEqual([
      ["p1", "Café Castillo"],
      ["p3", "AGR-2026-003"],
      ["p4", "p4"],
      ["p2", "p2"],
    ]);
    expect(view.projectLabels.p1).toBe("Café Castillo");
    expect(toProjectOptions({ not: "an array" })).toEqual([]);
  });

  it("keeps the steps view and falls back to the row ids when the project list answers 403", async () => {
    const fetchFn = (async (input: RequestInfo | URL) =>
      String(input).endsWith("/projects")
        ? new Response("{}", { status: 403 })
        : new Response(JSON.stringify([row()]), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const result = await loadPaymentSteps(new HttpPaymentStepsRepository({ baseUrl: "/api", fetchFn }), {});
    expect(result.ok && result.value.projects).toEqual([{ id: "p1", label: "p1" }]);
    expect(result.ok && result.value.payments).toHaveLength(1);
  });

  it("shortens an Open Payments URL to host and last segment", () => {
    expect(shortenUrl("https://wallet.example/alice/incoming-payments/abc")).toBe("wallet.example/…/abc");
  });
});
