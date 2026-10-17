import { InProcessDomainEvents, publishAll } from "./domain-events";

describe("InProcessDomainEvents", () => {
  it("delivers to every subscriber after the publisher moved on", async () => {
    const bus = new InProcessDomainEvents();
    const seen: string[] = [];
    bus.subscribe((e) => {
      seen.push(`a:${e.type}`);
    });
    bus.subscribe(async (e) => {
      seen.push(`b:${e.type}`);
    });
    bus.publish({ type: "project.funded", projectId: "p-1" });
    expect(seen).toEqual([]);
    await bus.drain();
    expect(seen).toEqual(["a:project.funded", "b:project.funded"]);
  });

  it("never lets a failing subscriber reach the publisher or the other subscribers", async () => {
    const bus = new InProcessDomainEvents();
    const seen: string[] = [];
    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe((e) => {
      seen.push(e.type);
    });
    expect(() => bus.publish({ type: "project.funded", projectId: "p-1" })).not.toThrow();
    await bus.drain();
    expect(seen).toEqual(["project.funded"]);
  });

  it("publishAll is a no-op without a bus", () => {
    expect(() => publishAll(undefined, [{ type: "project.funded", projectId: "p" }])).not.toThrow();
  });
});
