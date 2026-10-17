import { type DomainEvent, InProcessDomainEvents } from "../../../shared/events/domain-events";
import { applyLineResult } from "./milestone";
import { MilestoneStore } from "./milestone-store";
import { FakeRepository, sampleMilestone } from "./testing";

describe("MilestoneStore publishes what each write changed (RF-37)", () => {
  it("publishes a paid line after saving it", async () => {
    const events = new InProcessDomainEvents();
    const seen: DomainEvent[] = [];
    events.subscribe((e) => {
      seen.push(e);
    });
    const store = new MilestoneStore(new FakeRepository(new Map([["m1", sampleMilestone()]])), events);
    await store.update("m1", (m) => applyLineResult(m, "l-prod", { status: "completado", reference: "R" }, new Date()));
    await events.drain();
    expect(seen).toEqual([expect.objectContaining({ type: "line.paid", milestoneId: "m1", lineId: "l-prod", amount: 600_000 })]);
  });

  it("works without a bus", async () => {
    const store = new MilestoneStore(new FakeRepository(new Map([["m1", sampleMilestone()]])));
    await expect(store.update("m1", (m) => applyLineResult(m, "l-prod", { status: "completado", reference: "R" }, new Date()))).resolves.toBeTruthy();
  });
});
