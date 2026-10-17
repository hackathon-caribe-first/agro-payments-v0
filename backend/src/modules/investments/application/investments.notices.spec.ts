import { type DomainEvent, InProcessDomainEvents } from "../../../shared/events/domain-events";
import { InvestmentUseCases } from "./investments.use-cases";
import { PROJECT_STATUS } from "../../projects/application/project";
import { EUR_WALLET, FakeCapture, InMemoryInvestmentStore, INVESTOR, NOW, OTHER_INVESTOR, sampleProject } from "./testing";

describe("project activated notice (RF-37)", () => {
  it("publishes project.funded when a capture reaches the target, and not for a partial one", async () => {
    const store = new InMemoryInvestmentStore();
    store.projects.set("p1", sampleProject({ targetAmount: 10_000_000, custodyBalance: 8_000_000, currentStatus: PROJECT_STATUS.FUNDING_IN_PROGRESS }));
    const events = new InProcessDomainEvents();
    const seen: DomainEvent[] = [];
    events.subscribe((e) => {
      seen.push(e);
    });
    const useCases = new InvestmentUseCases(store, new FakeCapture(), { now: () => NOW }, events);
    await useCases.invest("p1", INVESTOR, { amount: 1_000_000, walletAddress: EUR_WALLET.id });
    await events.drain();
    expect(seen).toEqual([]);
    await useCases.invest("p1", OTHER_INVESTOR, { amount: 1_000_000, walletAddress: EUR_WALLET.id });
    await events.drain();
    expect(seen).toEqual([{ type: "project.funded", projectId: "p1" }]);
  });
});
