import { DomainError } from "../../../shared/domain-errors";
import type { PaymentGateway } from "../ports/payment-gateway";
import { applyLineResult, createMilestone, fund, submitEvidence } from "./milestone";
import { PayLineUseCase } from "./pay-line.use-case";
import { ReviewMilestoneUseCase } from "./review-milestone.use-case";
import { SubmitEvidenceUseCase } from "./submit-evidence.use-case";
import { FakeFunding, FakeGateway, fundedCustody, sampleMilestone, storeWith, ThrowingGateway, unfundedMilestone } from "./testing";

const submitted = () => submitEvidence(sampleMilestone(), "Foto", new Date());
const setup = <G extends PaymentGateway = FakeGateway>(gateway: G = new FakeGateway() as unknown as G) => {
  const store = storeWith(submitted());
  return { gateway, useCase: new ReviewMilestoneUseCase(store, new PayLineUseCase(store, gateway, new FakeFunding()), fundedCustody()) };
};
const line = (m: { lines: { id: string }[] }, id: string) => m.lines.find((l) => l.id === id);

describe("ReviewMilestoneUseCase", () => {
  // v3 (RF-20): approval pays the jornales line and the milestone fee (was the producer line only).
  it("approval pays the producer line and the platform fee through the gateway, not the supplier lines", async () => {
    const { useCase, gateway } = setup();

    const m = await useCase.execute("m1", "approved", null);

    expect(m.status).toBe("approved");
    expect(gateway.requests.map((r) => r.lineId)).toEqual(["l-prod", "l-fee"]);
    expect(line(m, "l-prod")).toMatchObject({ status: "completado" });
    expect(line(m, "l-fee")).toMatchObject({ status: "completado" });
    expect(line(m, "l-prov")).toMatchObject({ status: "pendiente" });
  });

  it("approval without jornales (level C) pays only the fee, and closes and revokes once nothing else is open (RF-22)", async () => {
    const noLabor = createMilestone({
      id: "m1",
      title: "Siembra",
      amount: 400_000,
      lines: unfundedMilestone().lines.filter((l) => l.kind !== "productor"),
    });
    const paidSupplies = applyLineResult(fund(noLabor, new Date()), "l-prov", { status: "completado", reference: "R" }, new Date());
    const store = storeWith(submitEvidence(paidSupplies, "Foto", new Date()));
    const gateway = new FakeGateway();
    const funding = new FakeFunding();

    const m = await new ReviewMilestoneUseCase(store, new PayLineUseCase(store, gateway, funding), fundedCustody()).execute("m1", "approved", null);

    expect(gateway.requests.map((r) => r.lineId)).toEqual(["l-fee"]);
    expect(m.closedAt).toBeInstanceOf(Date);
    expect(funding.revoked).toEqual(["m1"]);
  });

  it("approval with every line already final closes and revokes without paying anything", async () => {
    const supplierOnly = createMilestone({ id: "m1", title: "Siembra", amount: 300_000, lines: unfundedMilestone().lines.filter((l) => l.kind === "proveedor") });
    const paid = applyLineResult(fund(supplierOnly, new Date()), "l-prov", { status: "completado", reference: "R" }, new Date());
    const store = storeWith(submitEvidence(paid, "Foto", new Date()));
    const gateway = new FakeGateway();
    const funding = new FakeFunding();

    const m = await new ReviewMilestoneUseCase(store, new PayLineUseCase(store, gateway, funding), fundedCustody()).execute("m1", "approved", null);

    expect(gateway.requests).toHaveLength(0);
    expect(m.closedAt).toBeInstanceOf(Date);
    expect(funding.revoked).toEqual(["m1"]);
  });

  it("approval still succeeds when the producer payment fails, leaving that line fallido", async () => {
    const { useCase } = setup(new ThrowingGateway());
    const m = await useCase.execute("m1", "approved", null);
    expect(m.status).toBe("approved");
    expect(line(m, "l-prod")).toMatchObject({ status: "fallido" });
  });

  it("approval of an unfunded milestone records the decision and leaves the producer line for the operator", async () => {
    const gateway = new FakeGateway();
    const store = storeWith(submitEvidence(unfundedMilestone(), "Foto", new Date()));

    const m = await new ReviewMilestoneUseCase(store, new PayLineUseCase(store, gateway, new FakeFunding()), fundedCustody()).execute("m1", "approved", null);

    expect(m.status).toBe("approved");
    expect(line(m, "l-prod")).toMatchObject({ status: "pendiente" });
    expect(gateway.requests).toHaveLength(0);
  });

  it("observado needs a reason and pays nothing", async () => {
    const { useCase, gateway } = setup();
    await expect(useCase.execute("m1", "observado", null)).rejects.toThrow(DomainError);

    const m = await useCase.execute("m1", "observado", "La foto no muestra el lote");
    expect(m).toMatchObject({ status: "observado", review: { reason: "La foto no muestra el lote" } });
    expect(gateway.requests).toHaveLength(0);
  });
});

describe("legacy evidence and review on a LOCKED project milestone (RF-05)", () => {
  const inProject = (m: ReturnType<typeof unfundedMilestone>) => ({ ...m, projectId: "p1", sequenceOrder: 1 });

  it("refuses evidence and review while the project custody is not funded; nothing is paid", async () => {
    const custody = fundedCustody({ status: "FUNDING_IN_PROGRESS" });
    const draft = storeWith(inProject(unfundedMilestone()));
    await expect(new SubmitEvidenceUseCase(draft, custody).execute("m1", "Foto")).rejects.toThrow(/bloqueado/);
    expect((await draft.get("m1")).status).toBe("draft");

    const store = storeWith(inProject(submitted()));
    const gateway = new FakeGateway();
    await expect(new ReviewMilestoneUseCase(store, new PayLineUseCase(store, gateway, new FakeFunding()), custody).execute("m1", "approved", null)).rejects.toThrow(/bloqueado/);
    expect(gateway.requests).toHaveLength(0);
    expect((await store.get("m1")).status).toBe("evidence_submitted");
  });
});
