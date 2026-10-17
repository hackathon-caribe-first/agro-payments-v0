import { applyLineResult } from "./milestone";
import { SyncLinesUseCase } from "./sync-lines.use-case";
import { FakeGateway, sampleMilestone, storeWith, ThrowingGateway } from "./testing";

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
    const m = await new SyncLinesUseCase(storeWith(queued()), gateway).execute("m1");

    expect(gateway.checks.sort()).toEqual(["SIM-l-fee", "SIM-l-prov"]);
    expect(line(m, "l-prov")).toMatchObject({ status: "completado" });
    expect(line(m, "l-fee")).toMatchObject({ status: "completado" });
    expect(line(m, "l-prod")).toMatchObject({ status: "pendiente" });
  });

  it("applies a fallido outcome to one line without affecting the other", async () => {
    const gateway = new FakeGateway(undefined, (reference) =>
      reference === "SIM-l-fee" ? { status: "fallido", reference } : { status: "completado", reference },
    );
    const m = await new SyncLinesUseCase(storeWith(queued()), gateway).execute("m1");
    expect(line(m, "l-fee")).toMatchObject({ status: "fallido" });
    expect(line(m, "l-prov")).toMatchObject({ status: "completado" });
  });

  it("leaves lines en_cola when the gateway is unreachable", async () => {
    const m = await new SyncLinesUseCase(storeWith(queued()), new ThrowingGateway()).execute("m1");
    expect(line(m, "l-prov")).toMatchObject({ status: "en_cola" });
    expect(line(m, "l-fee")).toMatchObject({ status: "en_cola" });
  });

  it("does nothing when no line is queued", async () => {
    const gateway = new FakeGateway();
    await new SyncLinesUseCase(storeWith(sampleMilestone()), gateway).execute("m1");
    expect(gateway.checks).toHaveLength(0);
  });
});
