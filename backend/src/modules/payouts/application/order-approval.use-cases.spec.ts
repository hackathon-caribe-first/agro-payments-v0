import { DomainError, NotFoundError } from "../../../shared/domain-errors";
import { createMilestone, fund, LINE_KIND, type Milestone, remainingCap } from "../../milestones/application/milestone";
import { storeWith } from "../../milestones/application/testing";
import { OrderApprovalUseCases } from "./order-approval.use-cases";
import { InMemoryOrderIntents, InMemorySupplierRepository, orderIntent } from "./testing";

const now = new Date("2026-10-17T10:00:00Z");
// Cap 10.000.000 pesos: 1.000.000 labor + 300.000 fee, so 8.700.000 pesos left for supplies.
const milestone = (): Milestone =>
  fund(
    createMilestone({
      id: "p1-ms-1",
      title: "Fertilización",
      amount: 1_000_000_000,
      projectId: "p1",
      sequenceOrder: 1,
      lines: [
        { id: "p1-ms-1-productor", kind: LINE_KIND.PRODUCTOR, beneficiary: "Productor", walletAddress: "https://w.test/prod", amount: 100_000_000 },
        { id: "p1-ms-1-plataforma", kind: LINE_KIND.PLATAFORMA, beneficiary: "Plataforma", walletAddress: "https://w.test/fee", amount: 30_000_000 },
      ],
    }),
    now,
  );

async function setup(intents = [orderIntent("i-1", "p1-ms-1", 2_500_000), orderIntent("i-2", "p1-ms-1", 9_000_000), orderIntent("i-3", "other", 1)]) {
  const store = storeWith(milestone());
  const suppliers = new InMemorySupplierRepository();
  await suppliers.save({ id: "sup-1", name: "Almacén Don Pedro", walletAddress: "https://ilp.test/pedro", assetCode: "COP", assetScale: 2, createdAt: now });
  const orders = new InMemoryOrderIntents(intents);
  return { store, suppliers, orders, useCases: new OrderApprovalUseCases(store, orders, suppliers) };
}

describe("OrderApprovalUseCases (RF-15/RF-16, RF-34)", () => {
  it("lists the milestone's confirmed orders with their approval state", async () => {
    const { useCases } = await setup();
    expect((await useCases.list("p1-ms-1")).map((o) => [o.id, o.approval])).toEqual([
      ["i-1", "pending"],
      ["i-2", "pending"],
    ]);
    await expect(useCases.list("nope")).rejects.toThrow(NotFoundError);
  });

  it("approves an order into a pending proveedor line paid to the registered supplier's wallet, and records it on the intent", async () => {
    const { useCases, store, orders } = await setup();
    const { order, milestone: m } = await useCases.approve("p1-ms-1", "i-1", { supplierId: null }, "u-fidu");
    expect(m.lines.at(-1)).toMatchObject({
      id: "p1-ms-1-order-i-1",
      kind: LINE_KIND.PROVEEDOR,
      beneficiary: "Almacén Don Pedro",
      walletAddress: "https://ilp.test/pedro",
      amount: 250_000_000,
      status: "pendiente",
    });
    expect(remainingCap(await store.get("p1-ms-1"))).toBe(870_000_000 - 250_000_000);
    expect(order).toMatchObject({ approval: "approved", lineId: "p1-ms-1-order-i-1", decidedBy: "u-fidu" });
    expect((await orders.find("i-1"))?.approval).toBe("approved");
  });

  it("refuses (409) an order that does not fit the remaining cap and leaves it pending", async () => {
    const { useCases, store, orders } = await setup();
    await expect(useCases.approve("p1-ms-1", "i-2", { supplierId: null }, "u-fidu")).rejects.toThrow(/does not fit/);
    expect((await store.get("p1-ms-1")).lines).toHaveLength(2);
    expect((await orders.find("i-2"))?.approval).toBe("pending");
  });

  it("refuses (409) a supplier that is not registered, unless one is picked explicitly", async () => {
    const { useCases } = await setup([orderIntent("i-1", "p1-ms-1", 1_000, "Ferretería Nueva")]);
    await expect(useCases.approve("p1-ms-1", "i-1", { supplierId: null }, "u-admin")).rejects.toThrow(/not registered/);
    const { milestone: m } = await useCases.approve("p1-ms-1", "i-1", { supplierId: "sup-1" }, "u-admin");
    expect(m.lines.at(-1)?.walletAddress).toBe("https://ilp.test/pedro");
  });

  it("answers 404 for an order of another milestone or an unknown one, and 409 when it was already decided", async () => {
    const { useCases } = await setup();
    await expect(useCases.approve("p1-ms-1", "i-3", { supplierId: null }, "u")).rejects.toThrow(NotFoundError);
    await expect(useCases.approve("p1-ms-1", "nope", { supplierId: null }, "u")).rejects.toThrow(NotFoundError);
    await useCases.approve("p1-ms-1", "i-1", { supplierId: null }, "u");
    await expect(useCases.approve("p1-ms-1", "i-1", { supplierId: null }, "u")).rejects.toThrow(DomainError);
  });

  it("rejects an order with a reason, creating no line", async () => {
    const { useCases, store } = await setup();
    const order = await useCases.reject("p1-ms-1", "i-1", "Sin factura", "u-admin");
    expect(order).toMatchObject({ approval: "rejected", reason: "Sin factura", lineId: null });
    expect((await store.get("p1-ms-1")).lines).toHaveLength(2);
  });
});
