import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { ROLES_KEY } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { buildTrace } from "../application/op-trace";
import { InMemoryPaymentSteps } from "../application/testing";
import { OpTraceRepository, type OpTraceQuery } from "../ports/op-trace.repository";
import { parseTraceLimit, SupportController } from "./support.controller";

const meta = (key: string, handler?: string) =>
  Reflect.getMetadata(key, handler ? (SupportController.prototype as unknown as Record<string, object>)[handler] : SupportController);

class Traces extends OpTraceRepository {
  queries: OpTraceQuery[] = [];
  async record() {}
  async list(query: OpTraceQuery) {
    this.queries.push(query);
    return [
      buildTrace({
        call: { method: "GET", url: "https://ilp.test/c", accessToken: null, body: null },
        status: 200,
        durationMs: 3,
        response: { id: "https://ilp.test/c" },
        error: null,
        correlation: { milestoneId: "p-1-ms-1" },
        now: new Date("2026-10-17T00:00:00Z"),
        id: "t-1",
      }),
    ];
  }
}

describe("SupportController (RF-28)", () => {
  it("serves GET /api/support/traces to the operator (admin) and the fiduciaria (fidu) only", () => {
    expect(meta(GUARDS_METADATA)).toEqual([ApiAuthGuard, RolesGuard]);
    expect([RequestMethod[meta(METHOD_METADATA, "list")], `${meta(PATH_METADATA)}/${meta(PATH_METADATA, "list")}`]).toEqual(["GET", "api/support/traces"]);
    expect(meta(ROLES_KEY)).toEqual(["admin", "fidu"]);
  });

  it("answers snake_case traces with the curl and passes the project filter and limit", async () => {
    const traces = new Traces();
    const [first] = await new SupportController(traces, new InMemoryPaymentSteps()).list("p-1", "20");
    expect(traces.queries).toEqual([{ projectId: "p-1", limit: 20 }]);
    expect(first).toMatchObject({ id: "t-1", method: "GET", status: 200, duration_ms: 3, project_id: "p-1", curl: "curl -X GET 'https://ilp.test/c'" });
  });

  it("defaults and caps the limit", () => {
    expect(parseTraceLimit(undefined)).toBe(100);
    expect(parseTraceLimit("abc")).toBe(100);
    expect(parseTraceLimit("0")).toBe(1);
    expect(parseTraceLimit("9999")).toBe(500);
  });

  it("serves GET /api/support/payment-steps with the same guards: snake_case steps, oldest first, filtered, default limit 200", async () => {
    expect([RequestMethod[meta(METHOD_METADATA, "listSteps")], `${meta(PATH_METADATA)}/${meta(PATH_METADATA, "listSteps")}`]).toEqual(["GET", "api/support/payment-steps"]);
    const steps = new InMemoryPaymentSteps();
    await steps.record({ kind: "buyer_deposit", paymentId: "qr-1", step: "outgoing_created", opUrl: "https://rs.test/outgoing-payments/o-1", detail: null, projectId: "p-1" });
    await steps.record({ kind: "buyer_deposit", paymentId: "qr-1", step: "sent_unconfirmed", opUrl: null, detail: null, projectId: "p-1" });
    await steps.record({ kind: "milestone_line", paymentId: "p-2-ms-1:l-1", step: "completed", opUrl: null, detail: null, projectId: "p-2" });
    const list = vi.spyOn(steps, "list");

    const body = await new SupportController(new Traces(), steps).listSteps("p-1", "buyer_deposit", "", undefined);
    expect(list).toHaveBeenCalledWith({ projectId: "p-1", paymentKind: "buyer_deposit", paymentId: undefined, limit: 200 });
    expect(body).toEqual([
      { payment_kind: "buyer_deposit", payment_id: "qr-1", step: "outgoing_created", at: expect.any(String), op_url: "https://rs.test/outgoing-payments/o-1", detail: null, project_id: "p-1" },
      { payment_kind: "buyer_deposit", payment_id: "qr-1", step: "sent_unconfirmed", at: expect.any(String), op_url: null, detail: null, project_id: "p-1" },
    ]);
  });
});
