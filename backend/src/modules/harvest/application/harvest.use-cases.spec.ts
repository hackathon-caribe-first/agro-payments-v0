import { DomainError, NotFoundError, ValidationError } from "../../../shared/domain-errors";
import { sampleProject } from "../../investments/application/testing";
import { PROJECT_STATUS } from "../../projects/application/project";
import { HARVEST_STATUS, type PriceTerms } from "../domain/harvest";
import { PurchaseContractPrice } from "../ports/purchase-contract-price";
import { HarvestUseCases } from "./harvest.use-cases";
import { ADMIN, FakeHarvestPayment, FakeHarvestStore, HARVEST_BUYER, OTHER_BUYER, PRODUCER, VERIFIER } from "./testing";

const NOW = new Date("2027-03-01T12:00:00Z");
const clock = { now: () => NOW };
const declaration = { quantityKg: 10_000, qualityGrade: "Excelso", evidence: "Fotos de la cosecha en bodega" };
const certification = (price: PriceTerms | null = { kind: "fixed", pricePerKg: 12_000 }) => ({ quantityKg: 9_500, qualityGrade: "Excelso", notes: "Humedad 11 %", price });

function setup({ interactive = false, contract = null as PriceTerms | null } = {}) {
  const store = new FakeHarvestStore(sampleProject({ currentStatus: PROJECT_STATUS.IN_EXECUTION, custodyBalance: 50_000_000 }));
  const payment = new FakeHarvestPayment(interactive);
  const contracts = new (class extends PurchaseContractPrice {
    async termsFor() {
      return contract;
    }
  })();
  return { store, payment, useCases: new HarvestUseCases(store, payment, clock, contracts) };
}

async function certified(ctx = setup()) {
  await ctx.useCases.declare("p1", PRODUCER, declaration);
  await ctx.useCases.certify("p1", VERIFIER, certification());
  return ctx;
}

describe("HarvestUseCases.declare", () => {
  it("lets the owner producer declare: HARVEST_DECLARED", async () => {
    const { useCases, store } = setup();
    const h = await useCases.declare("p1", PRODUCER, declaration);
    expect(h).toMatchObject({ status: HARVEST_STATUS.DECLARED, declaredQuantityKg: 10_000, declaredBy: PRODUCER.id });
    expect(store.projects.get("p1")?.currentStatus).toBe(PROJECT_STATUS.HARVEST_DECLARED);
  });

  it("hides another producer's project (404) and refuses other roles (409)", async () => {
    const { useCases } = setup();
    await expect(useCases.declare("p1", { ...PRODUCER, id: "u-other" }, declaration)).rejects.toThrow(NotFoundError);
    await expect(useCases.declare("p1", HARVEST_BUYER, declaration)).rejects.toThrow(DomainError);
  });
});

describe("HarvestUseCases.certify", () => {
  it("has the verifier certify Q and quality and prices Q·P_g from the request without a contract: HARVEST_CERTIFIED", async () => {
    const { useCases, store } = setup();
    await useCases.declare("p1", PRODUCER, declaration);
    const h = await useCases.certify("p1", VERIFIER, certification());
    expect(h).toMatchObject({ status: HARVEST_STATUS.CERTIFIED, certifiedQuantityKg: 9_500, amountDue: 9_500 * 12_000 * 100, price: { source: "request", pricePerKg: 12_000 } });
    expect(store.projects.get("p1")?.currentStatus).toBe(PROJECT_STATUS.HARVEST_CERTIFIED);
  });

  it("prices from the purchase contract when there is one, ignoring the request's terms", async () => {
    const { useCases } = setup({ contract: { kind: "formula", spotPerKg: 20_000, floorPerKg: 15_000, ceilingPerKg: 25_000, discountBps: 1_000 } });
    await useCases.declare("p1", PRODUCER, declaration);
    const h = await useCases.certify("p1", VERIFIER, certification(null));
    expect(h.price).toMatchObject({ source: "contract", pricePerKg: 18_000 });
  });

  it("needs a price without a contract (400) and the verifier role (409)", async () => {
    const { useCases } = setup();
    await useCases.declare("p1", PRODUCER, declaration);
    await expect(useCases.certify("p1", VERIFIER, certification(null))).rejects.toThrow(ValidationError);
    await expect(useCases.certify("p1", PRODUCER, certification())).rejects.toThrow(DomainError);
  });
});

describe("HarvestUseCases.pay and confirmReception", () => {
  it("simulated: the buyer pays at once — HARVEST_PAYMENT credit, custody up and MARKET_PAYMENT_HELD; then reception: DELIVERED_TO_BUYER", async () => {
    const { useCases, store, payment } = await certified();
    const { harvest, redirectUrl } = await useCases.pay("p1", HARVEST_BUYER);
    expect(redirectUrl).toBeNull();
    expect(payment.started).toEqual([{ projectId: "p1", amount: 114_000_000_00, currency: "COP", assetScale: 2 }]);
    expect(harvest).toMatchObject({ status: HARVEST_STATUS.PAID, buyerUserId: HARVEST_BUYER.id, paymentReference: null });
    expect(store.credits).toEqual([expect.objectContaining({ projectId: "p1", amount: 114_000_000, buyerUserId: HARVEST_BUYER.id, currency: "COP" })]);
    const project = store.projects.get("p1");
    expect(project).toMatchObject({ custodyBalance: 50_000_000 + 114_000_000_00, currentStatus: PROJECT_STATUS.MARKET_PAYMENT_HELD });

    await expect(useCases.confirmReception("p1", OTHER_BUYER)).rejects.toThrow(DomainError);
    const received = await useCases.confirmReception("p1", HARVEST_BUYER);
    expect(received.status).toBe(HARVEST_STATUS.RECEIVED);
    expect(store.projects.get("p1")?.currentStatus).toBe(PROJECT_STATUS.DELIVERED_TO_BUYER);
  });

  it("open payments: returns the consent URL, keeps CERTIFIED, and the verified callback pays once (idempotent)", async () => {
    const { useCases, store, payment } = await certified(setup({ interactive: true }));
    const { harvest, redirectUrl } = await useCases.pay("p1", HARVEST_BUYER);
    expect(redirectUrl).toBe("https://wallet.test/consent/p1");
    expect(harvest).toMatchObject({ status: HARVEST_STATUS.CERTIFIED, buyerUserId: HARVEST_BUYER.id });
    expect(store.credits).toEqual([]);

    const paid = await useCases.completePayment("p1", { interactRef: "r", hash: "h" });
    expect(paid).toMatchObject({ status: HARVEST_STATUS.PAID, paymentReference: "OUT-p1" });
    expect(payment.completed).toHaveLength(1);
    await expect(useCases.completePayment("p1", { interactRef: "r", hash: "h" })).rejects.toThrow(DomainError);
    expect(store.credits).toHaveLength(1);
  });

  it("refuses to pay before certification or twice, and anyone but a buyer", async () => {
    const ctx = setup();
    await ctx.useCases.declare("p1", PRODUCER, declaration);
    await expect(ctx.useCases.pay("p1", HARVEST_BUYER)).rejects.toThrow(/certificada/);
    await ctx.useCases.certify("p1", VERIFIER, certification());
    await expect(ctx.useCases.pay("p1", PRODUCER)).rejects.toThrow(DomainError);
    await ctx.useCases.pay("p1", HARVEST_BUYER);
    await expect(ctx.useCases.pay("p1", HARVEST_BUYER)).rejects.toThrow(/pagada/);
  });
});

describe("HarvestUseCases.listForReview", () => {
  it("lists every harvest with its project for the verifier and refuses other roles", async () => {
    const { useCases } = setup();
    await useCases.declare("p1", PRODUCER, declaration);
    expect((await useCases.listForReview(VERIFIER)).map((r) => [r.project.id, r.harvest.status])).toEqual([["p1", HARVEST_STATUS.DECLARED]]);
    await expect(useCases.listForReview(PRODUCER)).rejects.toThrow(DomainError);
  });
});

describe("HarvestUseCases.get", () => {
  it("shows the harvest to the owner, verifier, buyers and staff; null before the declaration", async () => {
    const { useCases } = setup();
    expect((await useCases.get("p1", VERIFIER)).harvest).toBeNull();
    await useCases.declare("p1", PRODUCER, declaration);
    for (const viewer of [PRODUCER, VERIFIER, HARVEST_BUYER, ADMIN]) expect((await useCases.get("p1", viewer)).harvest?.status).toBe(HARVEST_STATUS.DECLARED);
    await expect(useCases.get("p1", { ...PRODUCER, id: "u-other" })).rejects.toThrow(NotFoundError);
  });
});
