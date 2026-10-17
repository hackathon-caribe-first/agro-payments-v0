import { DomainError } from "../../../shared/domain-errors";
import { CompleteFundingUseCase } from "./complete-funding.use-case";
import { fund } from "./milestone";
import { StartFundingUseCase } from "./start-funding.use-case";
import { FakeFunding, fundedCustody, storeWith, unfundedMilestone } from "./testing";

const callback = { interactRef: "ref-1", hash: "h" };

describe("StartFundingUseCase", () => {
  it("asks the investor's wallet for consent and returns where to send the browser", async () => {
    const funding = new FakeFunding();
    const result = await new StartFundingUseCase(storeWith(unfundedMilestone()), funding, fundedCustody()).execute("m1");
    expect(result).toEqual({ redirectUrl: "https://wallet.test/consent/m1" });
    expect(funding.started).toEqual(["m1"]);
  });

  it("refuses a milestone that is already funded", async () => {
    const funding = new FakeFunding();
    const useCase = new StartFundingUseCase(storeWith(fund(unfundedMilestone(), new Date())), funding, fundedCustody());
    await expect(useCase.execute("m1")).rejects.toThrow(DomainError);
    expect(funding.started).toHaveLength(0);
  });
});

describe("StartFundingUseCase grant sequence (RF-13)", () => {
  const inProject = (order: number) => ({ ...unfundedMilestone(), id: `p1-ms-${order}`, projectId: "p1", sequenceOrder: order });

  it("refuses milestone N+1 while milestone N still has its live grant, before reaching the wallet", async () => {
    const funding = new FakeFunding();
    const useCase = new StartFundingUseCase(storeWith(fund(inProject(1), new Date()), inProject(2)), funding, fundedCustody());
    await expect(useCase.execute("p1-ms-2")).rejects.toThrow(/live grant/);
    expect(funding.started).toHaveLength(0);
  });

  it("starts milestone N+1 once milestone N closed", async () => {
    const funding = new FakeFunding();
    const closed = { ...fund(inProject(1), new Date()), status: "approved" as const, closedAt: new Date() };
    await new StartFundingUseCase(storeWith(closed, inProject(2)), funding, fundedCustody()).execute("p1-ms-2");
    expect(funding.started).toEqual(["p1-ms-2"]);
  });
});

describe("StartFundingUseCase custody gate (RF-05)", () => {
  const first = { ...unfundedMilestone(), id: "p1-ms-1", projectId: "p1", sequenceOrder: 1 };

  it("refuses a project milestone before the project is funded in custody, or beyond what custody still holds", async () => {
    for (const status of ["DRAFT", "CONTRACT_SIGNED", "FUNDING_IN_PROGRESS", "SETTLED_AND_CLOSED"] as const) {
      const funding = new FakeFunding();
      await expect(new StartFundingUseCase(storeWith(first), funding, fundedCustody({ status })).execute("p1-ms-1")).rejects.toThrow(/custodia/);
      expect(funding.started).toHaveLength(0);
    }
    const funding = new FakeFunding();
    await expect(new StartFundingUseCase(storeWith(first), funding, fundedCustody({ available: 999_999 })).execute("p1-ms-1")).rejects.toThrow(/custodia/);
    expect(funding.started).toHaveLength(0);
    await new StartFundingUseCase(storeWith(first), funding, fundedCustody({ status: "IN_EXECUTION", available: 1_000_000 })).execute("p1-ms-1");
    expect(funding.started).toEqual(["p1-ms-1"]);
  });
});

describe("CompleteFundingUseCase", () => {
  it("finalizes the grant and marks the milestone funded", async () => {
    const funding = new FakeFunding();
    const store = storeWith(unfundedMilestone());

    const m = await new CompleteFundingUseCase(store, funding).execute("m1", callback);

    expect(funding.completed).toEqual([{ milestoneId: "m1", params: callback }]);
    expect(m.fundedAt).toBeInstanceOf(Date);
    expect((await store.get("m1")).fundedAt).toEqual(m.fundedAt);
  });

  it("leaves the milestone unfunded when the wallet callback is rejected", async () => {
    const store = storeWith(unfundedMilestone());
    await expect(new CompleteFundingUseCase(store, new FakeFunding(true)).execute("m1", callback)).rejects.toThrow("hash mismatch");
    expect((await store.get("m1")).fundedAt).toBeNull();
  });

  it("refuses an already funded milestone without touching the grant", async () => {
    const funding = new FakeFunding();
    const useCase = new CompleteFundingUseCase(storeWith(fund(unfundedMilestone(), new Date())), funding);
    await expect(useCase.execute("m1", callback)).rejects.toThrow(DomainError);
    expect(funding.completed).toHaveLength(0);
  });
});
