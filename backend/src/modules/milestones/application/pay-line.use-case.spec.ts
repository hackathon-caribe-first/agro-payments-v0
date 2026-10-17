import { DomainError } from "../../../shared/domain-errors";
import { review, submitEvidence } from "./milestone";
import { PayLineUseCase } from "./pay-line.use-case";
import { FakeGateway, sampleMilestone, storeWith, ThrowingGateway, unfundedMilestone } from "./testing";

const approvedMilestone = () => review(submitEvidence(sampleMilestone(), "Foto", new Date()), "approved", null, new Date());
const line = (m: { lines: { id: string }[] }, id: string) => m.lines.find((l) => l.id === id);

describe("PayLineUseCase", () => {
  it("pays a supplier line before approval and leaves the producer line pendiente", async () => {
    const gateway = new FakeGateway();
    const useCase = new PayLineUseCase(storeWith(sampleMilestone()), gateway);

    const m = await useCase.execute("m1", "l-prov");

    expect(line(m, "l-prov")).toMatchObject({ status: "completado", reference: "REF-1" });
    expect(line(m, "l-prod")).toMatchObject({ status: "pendiente" });
    expect(gateway.requests).toEqual([
      { milestoneId: "m1", lineId: "l-prov", walletAddress: "https://wallet.test/prov", amount: 300_000, currency: "COP", assetScale: 2 },
    ]);
  });

  it("blocks the producer line before approval without calling the gateway", async () => {
    const gateway = new FakeGateway();
    const useCase = new PayLineUseCase(storeWith(sampleMilestone()), gateway);

    await expect(useCase.execute("m1", "l-prod")).rejects.toThrow(DomainError);
    expect(gateway.requests).toHaveLength(0);
  });

  it("refuses an unfunded milestone with a DomainError before the gateway, so the line stays pendiente", async () => {
    const gateway = new FakeGateway();
    const store = storeWith(unfundedMilestone());

    await expect(new PayLineUseCase(store, gateway).execute("m1", "l-prov")).rejects.toThrow(DomainError);
    expect(gateway.requests).toHaveLength(0);
    expect(line(await store.get("m1"), "l-prov")).toMatchObject({ status: "pendiente", reference: null });
  });

  it("pays the producer line once approved", async () => {
    const useCase = new PayLineUseCase(storeWith(approvedMilestone()), new FakeGateway());
    expect(line(await useCase.execute("m1", "l-prod"), "l-prod")).toMatchObject({ status: "completado" });
  });

  it("keeps a queued line en_cola with its reference", async () => {
    const gateway = new FakeGateway(() => ({ status: "en_cola", reference: "SIM-1" }));
    const m = await new PayLineUseCase(storeWith(sampleMilestone()), gateway).execute("m1", "l-prov");
    expect(line(m, "l-prov")).toMatchObject({ status: "en_cola", reference: "SIM-1", settledAt: null });
  });

  // ponytail: a fallido line is final by design; retrying through the real adapter is deferred.
  it("marks the line fallido when the gateway throws, leaving the other lines untouched", async () => {
    const m = await new PayLineUseCase(storeWith(sampleMilestone()), new ThrowingGateway()).execute("m1", "l-prov");
    expect(line(m, "l-prov")).toMatchObject({ status: "fallido", reference: null });
    expect(line(m, "l-fee")).toMatchObject({ status: "pendiente" });
    expect(line(m, "l-prod")).toMatchObject({ status: "pendiente" });
  });

  it("marks the line fallido when the gateway reports a failure", async () => {
    const gateway = new FakeGateway(() => ({ status: "fallido", reference: null }));
    const m = await new PayLineUseCase(storeWith(sampleMilestone()), gateway).execute("m1", "l-fee");
    expect(line(m, "l-fee")).toMatchObject({ status: "fallido" });
  });
});
