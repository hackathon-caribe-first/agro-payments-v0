import { DomainError } from "../../../shared/domain-errors";
import { applyLineResult, review, submitEvidence } from "./milestone";
import { PayLineUseCase } from "./pay-line.use-case";
import { FakeFunding, FakeGateway, sampleMilestone, storeWith, ThrowingGateway, unfundedMilestone } from "./testing";

const approvedMilestone = () => review(submitEvidence(sampleMilestone(), "Foto", new Date()), "approved", null, new Date());
const line = (m: { lines: { id: string }[] }, id: string) => m.lines.find((l) => l.id === id);

describe("PayLineUseCase", () => {
  it("pays a supplier line before approval and leaves the producer line pendiente", async () => {
    const gateway = new FakeGateway();
    const useCase = new PayLineUseCase(storeWith(sampleMilestone()), gateway, new FakeFunding());

    const m = await useCase.execute("m1", "l-prov");

    expect(line(m, "l-prov")).toMatchObject({ status: "completado", reference: "REF-1" });
    expect(line(m, "l-prod")).toMatchObject({ status: "pendiente" });
    expect(gateway.requests).toEqual([
      { milestoneId: "m1", lineId: "l-prov", walletAddress: "https://wallet.test/prov", amount: 300_000, currency: "COP", assetScale: 2 },
    ]);
  });

  it("blocks the producer line before approval without calling the gateway", async () => {
    const gateway = new FakeGateway();
    const useCase = new PayLineUseCase(storeWith(sampleMilestone()), gateway, new FakeFunding());

    await expect(useCase.execute("m1", "l-prod")).rejects.toThrow(DomainError);
    expect(gateway.requests).toHaveLength(0);
  });

  it("refuses an unfunded milestone with a DomainError before the gateway, so the line stays pendiente", async () => {
    const gateway = new FakeGateway();
    const store = storeWith(unfundedMilestone());

    await expect(new PayLineUseCase(store, gateway, new FakeFunding()).execute("m1", "l-prov")).rejects.toThrow(DomainError);
    expect(gateway.requests).toHaveLength(0);
    expect(line(await store.get("m1"), "l-prov")).toMatchObject({ status: "pendiente", reference: null });
  });

  it("pays the producer line once approved", async () => {
    const useCase = new PayLineUseCase(storeWith(approvedMilestone()), new FakeGateway(), new FakeFunding());
    expect(line(await useCase.execute("m1", "l-prod"), "l-prod")).toMatchObject({ status: "completado" });
  });

  it("keeps a queued line en_cola with its reference", async () => {
    const gateway = new FakeGateway(() => ({ status: "en_cola", reference: "SIM-1" }));
    const m = await new PayLineUseCase(storeWith(sampleMilestone()), gateway, new FakeFunding()).execute("m1", "l-prov");
    expect(line(m, "l-prov")).toMatchObject({ status: "en_cola", reference: "SIM-1", settledAt: null });
  });

  // ponytail: a fallido line is final by design; retrying through the real adapter is deferred.
  it("marks the line fallido when the gateway throws, leaving the other lines untouched", async () => {
    const m = await new PayLineUseCase(storeWith(sampleMilestone()), new ThrowingGateway(), new FakeFunding()).execute("m1", "l-prov");
    expect(line(m, "l-prov")).toMatchObject({ status: "fallido", reference: null });
    expect(line(m, "l-fee")).toMatchObject({ status: "pendiente" });
    expect(line(m, "l-prod")).toMatchObject({ status: "pendiente" });
  });

  it("marks the line fallido when the gateway reports a failure", async () => {
    const gateway = new FakeGateway(() => ({ status: "fallido", reference: null }));
    const m = await new PayLineUseCase(storeWith(sampleMilestone()), gateway, new FakeFunding()).execute("m1", "l-fee");
    expect(line(m, "l-fee")).toMatchObject({ status: "fallido" });
  });

  it("stores the receipt the gateway reported on the line", async () => {
    const cop = (value: number) => ({ value, assetCode: "COP", assetScale: 2 });
    const receipt = { incomingPaymentId: "in-1", outgoingPaymentId: "out-1", quoteId: "q-1", debitAmount: cop(300_100), receiveAmount: cop(300_000), grantSpentBefore: 0 };
    const gateway = new FakeGateway(() => ({ status: "en_cola", reference: "OP-1", receipt }));
    const m = await new PayLineUseCase(storeWith(sampleMilestone()), gateway, new FakeFunding()).execute("m1", "l-prov");
    expect(line(m, "l-prov")).toMatchObject({ receipt: { ...receipt, rate: "3000/3001", fee: 100, grantSpentAfter: null } });
  });

  it("propagates a DomainError from the gateway (a revoked grant) instead of failing the line", async () => {
    const gateway = new FakeGateway(() => {
      throw new DomainError("grant revoked");
    });
    const store = storeWith(sampleMilestone());
    await expect(new PayLineUseCase(store, gateway, new FakeFunding()).execute("m1", "l-prov")).rejects.toThrow(DomainError);
    expect(line(await store.get("m1"), "l-prov")).toMatchObject({ status: "pendiente" });
  });
});

describe("PayLineUseCase grant revocation (RF-22)", () => {
  const settled = (id: string) => ({ status: "completado" as const, reference: `REF-${id}` });
  // Producer and fee already paid: paying the supplier line closes the milestone.
  const lastLineOpen = () =>
    ["l-prod", "l-fee"].reduce((m, id) => applyLineResult(m, id, settled(id), new Date()), approvedMilestone());

  it("revokes the grant exactly once when the payment closes an approved milestone", async () => {
    const funding = new FakeFunding();
    const m = await new PayLineUseCase(storeWith(lastLineOpen()), new FakeGateway(), funding).execute("m1", "l-prov");
    expect(m.closedAt).toBeInstanceOf(Date);
    expect(funding.revoked).toEqual(["m1"]);
  });

  it("does not revoke while lines are still open", async () => {
    const funding = new FakeFunding();
    await new PayLineUseCase(storeWith(sampleMilestone()), new FakeGateway(), funding).execute("m1", "l-prov");
    expect(funding.revoked).toEqual([]);
  });

  it("keeps the milestone closed when the revoke fails, so it can be retried", async () => {
    const store = storeWith(lastLineOpen());
    const m = await new PayLineUseCase(store, new FakeGateway(), new FakeFunding(false, true)).execute("m1", "l-prov");
    expect(m.closedAt).toBeInstanceOf(Date);
    expect((await store.get("m1")).closedAt).toEqual(m.closedAt);
  });

  it("refuses any payment after the milestone closed with a DomainError (409), before the gateway", async () => {
    const gateway = new FakeGateway();
    const store = storeWith(lastLineOpen());
    const useCase = new PayLineUseCase(store, gateway, new FakeFunding());
    await useCase.execute("m1", "l-prov");

    for (const id of ["l-prod", "l-prov", "l-fee"]) await expect(useCase.execute("m1", id)).rejects.toThrow(DomainError);
    expect(gateway.requests.map((r) => r.lineId)).toEqual(["l-prov"]);
  });
});
