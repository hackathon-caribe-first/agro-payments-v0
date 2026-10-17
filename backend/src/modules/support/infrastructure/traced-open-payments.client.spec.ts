import { authError, CUSTODY, mockOpenPayments, RECEIVER } from "../../milestones/infrastructure/adapters/open-payments.testing";
import type { OpTrace } from "../application/op-trace";
import { withOpTraceContext } from "../application/op-trace";
import { OpTraceRepository } from "../ports/op-trace.repository";
import { traceOpenPaymentsClient } from "./traced-open-payments.client";

class MemoryTraces extends OpTraceRepository {
  readonly traces: OpTrace[] = [];
  fail = false;
  async record(trace: OpTrace) {
    if (this.fail) throw new Error("db down");
    this.traces.push(trace);
  }
  async list() {
    return this.traces;
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

const setup = () => {
  const mock = mockOpenPayments();
  const traces = new MemoryTraces();
  return { ...mock, traces, client: traceOpenPaymentsClient(mock.op.client, traces), raw: mock.client };
};

describe("traceOpenPaymentsClient (RF-28)", () => {
  it("records a resource-server create as POST on the collection, with the trimmed token and the correlation in scope", async () => {
    const { client, traces } = setup();
    const created = await withOpTraceContext({ milestoneId: "p-9-ms-1" }, () =>
      client.incomingPayment.create(
        { url: RECEIVER.resourceServer, accessToken: "incoming-payment-token" },
        { walletAddress: RECEIVER.id, incomingAmount: { value: "3000", assetCode: "COP", assetScale: 2 } },
      ),
    );
    await flush();

    expect(created.id).toBe(`${RECEIVER.resourceServer}/incoming-payments/in-1`);
    expect(traces.traces).toHaveLength(1);
    const [trace] = traces.traces;
    expect(trace).toMatchObject({ method: "POST", url: `${RECEIVER.resourceServer}/incoming-payments`, status: 201, projectId: "p-9", milestoneId: "p-9-ms-1", error: null });
    expect(trace.curl).toContain("Authorization: GNAP incomi…");
    expect(JSON.stringify(trace)).not.toContain("incoming-payment-token");
  });

  it("records a wallet GET without a token", async () => {
    const { client, traces } = setup();
    await client.walletAddress.get({ url: CUSTODY.id });
    await flush();
    expect(traces.traces[0]).toMatchObject({ method: "GET", url: CUSTODY.id, status: 200, curl: `curl -X GET '${CUSTODY.id}'` });
  });

  it("records a failed request with the SDK's status and rethrows the original error", async () => {
    const { client, raw, traces } = setup();
    raw.outgoingPayment.create.mockRejectedValueOnce(authError(401));
    await expect(client.outgoingPayment.create({ url: CUSTODY.resourceServer, accessToken: "outgoing-token" }, { walletAddress: CUSTODY.id, quoteId: "q" })).rejects.toThrow(
      "Error making Open Payments request",
    );
    await flush();
    expect(traces.traces[0]).toMatchObject({ method: "POST", url: `${CUSTODY.resourceServer}/outgoing-payments`, status: 401, responseSummary: null });
    expect(traces.traces[0].error).toContain("Error making Open Payments request");
  });

  it("never fails the payment when the trace cannot be stored", async () => {
    const { client, traces } = setup();
    traces.fail = true;
    await expect(client.walletAddress.get({ url: CUSTODY.id })).resolves.toMatchObject({ id: CUSTODY.id });
    await flush();
  });

  it("keeps grant tokens out of the stored response", async () => {
    const { client, traces } = setup();
    await client.grant.request({ url: CUSTODY.authServer }, { access_token: { access: [{ type: "quote", actions: ["create", "read"] }] } });
    await flush();
    expect(traces.traces[0]).toMatchObject({ method: "POST", url: CUSTODY.authServer });
    expect(traces.traces[0].responseSummary).toContain("quote-…");
    expect(traces.traces[0].responseSummary).not.toContain("quote-token");
  });
});
