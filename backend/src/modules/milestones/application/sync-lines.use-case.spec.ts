import { applyLineResult, review, submitEvidence } from "./milestone";
import { SyncLinesUseCase } from "./sync-lines.use-case";
import { FakeFunding, FakeGateway, sampleMilestone, storeWith, ThrowingGateway } from "./testing";

const now = new Date();
const queued = () =>
  ["l-prov", "l-fee"].reduce(
    (m, id) => applyLineResult(m, id, { status: "en_cola", reference: `SIM-${id}` }, now),
    sampleMilestone(),
  );
const line = (m: { lines: { id: string }[] }, id: string) => m.lines.find((l) => l.id === id);

describe("SyncLinesUseCase", () => {
  it("resolves every queued line through the gateway and ignores the rest", async () => {
    const gateway = new FakeGateway();
    const m = await new SyncLinesUseCase(storeWith(queued()), gateway, new FakeFunding()).execute("m1");

    expect(gateway.checks.sort()).toEqual(["SIM-l-fee", "SIM-l-prov"]);
    expect(line(m, "l-prov")).toMatchObject({ status: "completado" });
    expect(line(m, "l-fee")).toMatchObject({ status: "completado" });
    expect(line(m, "l-prod")).toMatchObject({ status: "pendiente" });
  });

  it("applies a fallido outcome to one line without affecting the other", async () => {
    const gateway = new FakeGateway(undefined, (reference) =>
      reference === "SIM-l-fee" ? { status: "fallido", reference } : { status: "completado", reference },
    );
    const m = await new SyncLinesUseCase(storeWith(queued()), gateway, new FakeFunding()).execute("m1");
    expect(line(m, "l-fee")).toMatchObject({ status: "fallido" });
    expect(line(m, "l-prov")).toMatchObject({ status: "completado" });
  });

  it("leaves lines en_cola when the gateway is unreachable", async () => {
    const m = await new SyncLinesUseCase(storeWith(queued()), new ThrowingGateway(), new FakeFunding()).execute("m1");
    expect(line(m, "l-prov")).toMatchObject({ status: "en_cola" });
    expect(line(m, "l-fee")).toMatchObject({ status: "en_cola" });
  });

  it("does nothing when no line is queued", async () => {
    const gateway = new FakeGateway();
    await new SyncLinesUseCase(storeWith(sampleMilestone()), gateway, new FakeFunding()).execute("m1");
    expect(gateway.checks).toHaveLength(0);
  });

  const approved = () => review(submitEvidence(sampleMilestone(), "Foto", now), "approved", null, now);
  const closedWith = (base: ReturnType<typeof sampleMilestone>) =>
    ["l-prod", "l-prov", "l-fee"].reduce((m, id) => applyLineResult(m, id, { status: "completado", reference: id }, now), base);

  it("revokes the grant (RF-22) when the sync settles the last open line of an approved milestone", async () => {
    const funding = new FakeFunding();
    const allQueued = ["l-prod", "l-prov", "l-fee"].reduce((m, id) => applyLineResult(m, id, { status: "en_cola", reference: `SIM-${id}` }, now), approved());
    const m = await new SyncLinesUseCase(storeWith(allQueued), new FakeGateway(), funding).execute("m1");
    expect(m.closedAt).toBeInstanceOf(Date);
    expect(funding.revoked).toEqual(["m1"]);
  });

  it("retries the revoke of an already closed milestone, and never for an open one", async () => {
    const funding = new FakeFunding();
    await new SyncLinesUseCase(storeWith(closedWith(approved())), new FakeGateway(), funding).execute("m1");
    await new SyncLinesUseCase(storeWith(queued()), new ThrowingGateway(), funding).execute("m1");
    expect(funding.revoked).toEqual(["m1"]);
  });

  it("does not revoke a closed milestone that was never approved", async () => {
    const funding = new FakeFunding();
    await new SyncLinesUseCase(storeWith(closedWith(sampleMilestone())), new FakeGateway(), funding).execute("m1");
    expect(funding.revoked).toEqual([]);
  });

  it("merges the settlement receipt into the queued line", async () => {
    const gateway = new FakeGateway(undefined, (reference) => ({ status: "completado", reference, receipt: { receiveAmount: { value: 1, assetCode: "COP", assetScale: 2 } } }));
    const m = await new SyncLinesUseCase(storeWith(queued()), gateway, new FakeFunding()).execute("m1");
    expect(line(m, "l-prov")).toMatchObject({ receipt: { receiveAmount: { value: 1 }, debitAmount: null, fee: null, rate: null } });
  });
});
