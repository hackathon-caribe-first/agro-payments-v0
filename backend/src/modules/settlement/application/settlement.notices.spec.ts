import { type DomainEvent, InProcessDomainEvents } from "../../../shared/events/domain-events";
import { FakeGateway, FakeRepository } from "../../milestones/application/testing";
import { CreateProjectUseCase } from "../../projects/application/create-project.use-case";
import { PROJECT_STATUS, type Viewer } from "../../projects/application/project";
import { FakeProjectRepository } from "../../projects/application/testing";
import { SimulatedLiquidationFunding } from "../infrastructure/adapters/simulated-liquidation-funding.adapter";
import { SettlementUseCases } from "./settlement.use-cases";
import { FakeSettlementRepository, sampleTerms } from "./testing";

const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
const admin: Viewer = { id: "u-admin", role: "admin" };

describe("settlement executed notice (RF-37)", () => {
  it("publishes settlement.executed when the last payout settles", async () => {
    const projects = new FakeProjectRepository(new FakeRepository(new Map()));
    const project = await new CreateProjectUseCase(projects, wallets).execute({ id: "u-prod", role: "seller" }, {
      title: "Tomate P2",
      description: "Tomate bajo invernadero",
      productionType: "OTRO",
      startDate: "2026-11-01",
      estimatedEndDate: "2027-03-30",
      milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 100, laborBudget: 200, requirements: [] }],
    });
    // The settlement executes only once the buyer confirmed reception (harvest RF-24/RF-27 gate).
    await projects.updateStatus(project.id, PROJECT_STATUS.DELIVERED_TO_BUYER);
    const events = new InProcessDomainEvents();
    const seen: DomainEvent[] = [];
    events.subscribe((e) => {
      seen.push(e);
    });
    const useCases = new SettlementUseCases(projects, new FakeSettlementRepository(), new FakeGateway(), wallets, new SimulatedLiquidationFunding(), undefined, undefined, events);
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    await useCases.approve(draft.id, { id: "u-fidu", role: "fidu" });
    await useCases.execute(draft.id);
    await expect(useCases.execute(draft.id)).rejects.toThrow();
    await events.drain();
    expect(seen).toEqual([{ type: "settlement.executed", projectId: project.id, settlementId: draft.id }]);
  });
});
