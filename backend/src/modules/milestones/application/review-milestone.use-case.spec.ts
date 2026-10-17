import { DomainError } from "../../../shared/domain-errors";
import type { PaymentGateway } from "../ports/payment-gateway";
import { submitEvidence } from "./milestone";
import { PayLineUseCase } from "./pay-line.use-case";
import { ReviewMilestoneUseCase } from "./review-milestone.use-case";
import { FakeGateway, sampleMilestone, storeWith, ThrowingGateway } from "./testing";

const submitted = () => submitEvidence(sampleMilestone(), "Foto", new Date());
const setup = <G extends PaymentGateway = FakeGateway>(gateway: G = new FakeGateway() as unknown as G) => {
  const store = storeWith(submitted());
  return { gateway, useCase: new ReviewMilestoneUseCase(store, new PayLineUseCase(store, gateway)) };
};
const line = (m: { lines: { id: string }[] }, id: string) => m.lines.find((l) => l.id === id);

describe("ReviewMilestoneUseCase", () => {
  it("approval pays only the producer line through the gateway", async () => {
    const { useCase, gateway } = setup();

    const m = await useCase.execute("m1", "approved", null);

    expect(m.status).toBe("approved");
    expect(gateway.requests.map((r) => r.lineId)).toEqual(["l-prod"]);
    expect(line(m, "l-prod")).toMatchObject({ status: "completado" });
    expect(line(m, "l-prov")).toMatchObject({ status: "pendiente" });
  });

  it("approval still succeeds when the producer payment fails, leaving that line fallido", async () => {
    const { useCase } = setup(new ThrowingGateway());
    const m = await useCase.execute("m1", "approved", null);
    expect(m.status).toBe("approved");
    expect(line(m, "l-prod")).toMatchObject({ status: "fallido" });
  });

  it("observado needs a reason and pays nothing", async () => {
    const { useCase, gateway } = setup();
    await expect(useCase.execute("m1", "observado", null)).rejects.toThrow(DomainError);

    const m = await useCase.execute("m1", "observado", "La foto no muestra el lote");
    expect(m).toMatchObject({ status: "observado", review: { reason: "La foto no muestra el lote" } });
    expect(gateway.requests).toHaveLength(0);
  });
});
