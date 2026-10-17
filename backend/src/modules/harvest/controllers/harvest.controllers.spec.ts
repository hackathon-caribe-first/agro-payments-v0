import { sampleProject } from "../../investments/application/testing";
import { PROJECT_STATUS } from "../../projects/application/project";
import { HarvestUseCases } from "../application/harvest.use-cases";
import { FakeHarvestPayment, FakeHarvestStore, HARVEST_BUYER, PRODUCER, VERIFIER } from "../application/testing";
import { HarvestPaymentCallbackController } from "./harvest-payment-callback.controller";
import { toCustodyResponse, toHarvestResponse } from "./harvest.mappers";

const NOW = new Date("2027-03-01T12:00:00Z");
const ids = { toPublic: (id: string) => (id === HARVEST_BUYER.id ? "buyer-andina" : id), toUser: (id: string) => id };

async function paidHarvest(interactive = false) {
  const store = new FakeHarvestStore(sampleProject({ currentStatus: PROJECT_STATUS.IN_EXECUTION }));
  const useCases = new HarvestUseCases(store, new FakeHarvestPayment(interactive), { now: () => NOW });
  await useCases.declare("p1", PRODUCER, { quantityKg: 1_000, qualityGrade: "Excelso", evidence: "Fotos" });
  await useCases.certify("p1", VERIFIER, {
    quantityKg: 900,
    qualityGrade: "Excelso",
    notes: null,
    price: { kind: "formula", spotPerKg: 20_000, floorPerKg: 15_000, ceilingPerKg: 25_000, discountBps: 750 },
  });
  await useCases.pay("p1", HARVEST_BUYER);
  return { store, useCases };
}

describe("harvest wire shape", () => {
  it("pesos for Q·P_g, the price terms with the discount in percent, the public buyer id and ISO dates", async () => {
    const { useCases } = await paidHarvest();
    const { project, harvest } = await useCases.get("p1", PRODUCER);
    expect(toHarvestResponse(project, harvest, ids)).toEqual({
      project_id: "p1",
      project_code: "AGR-2026-001",
      project_title: "Café especial",
      project_status: PROJECT_STATUS.MARKET_PAYMENT_HELD,
      harvest: {
        status: "PAID",
        declared_quantity_kg: 1_000,
        declared_quality: "Excelso",
        evidence: "Fotos",
        declared_at: NOW.toISOString(),
        certified_quantity_kg: 900,
        certified_quality: "Excelso",
        certification_notes: null,
        certified_at: NOW.toISOString(),
        price: {
          source: "request",
          price_per_kg: 18_500,
          exchange_factor: "1/1",
          terms: { kind: "formula", spot_price_per_kg: 20_000, floor_price_per_kg: 15_000, ceiling_price_per_kg: 25_000, discount_pct: 7.5 },
        },
        amount_due: 900 * 18_500,
        currency: "COP",
        buyer_id: "buyer-andina",
        payment_reference: null,
        paid_at: NOW.toISOString(),
        received_at: null,
      },
      payment_redirect_url: null,
    });
  });

  it("the custody statement in pesos", () => {
    const statement = { currency: "COP", assetScale: 2, credited: 500_00, credits: [{ category: "HARVEST_PAYMENT", amount: 500_00 }], milestoneDebits: 100_00, settlementDebits: 50_00, balance: 350_00 };
    expect(toCustodyResponse("p1", statement)).toEqual({
      project_id: "p1",
      currency: "COP",
      balance: 350,
      credited: 500,
      credits: [{ category: "HARVEST_PAYMENT", amount: 500 }],
      debited: 150,
      milestone_debits: 100,
      settlement_debits: 50,
    });
  });
});

describe("HarvestPaymentCallbackController", () => {
  const WEB = "http://web.test";

  it("pays on a verified callback and sends the buyer back with ok; error without interact_ref or when it fails", async () => {
    const store = new FakeHarvestStore(sampleProject({ currentStatus: PROJECT_STATUS.IN_EXECUTION }));
    const useCases = new HarvestUseCases(store, new FakeHarvestPayment(true), { now: () => NOW });
    await useCases.declare("p1", PRODUCER, { quantityKg: 1, qualityGrade: "A", evidence: "Fotos" });
    await useCases.certify("p1", VERIFIER, { quantityKg: 1, qualityGrade: "A", notes: null, price: { kind: "fixed", pricePerKg: 1 } });
    await useCases.pay("p1", HARVEST_BUYER);
    const controller = new HarvestPaymentCallbackController(useCases, WEB);
    expect(await controller.callback("p1")).toEqual({ url: `${WEB}/buyer/projects/p1?harvest_payment=error`, statusCode: 302 });
    expect(await controller.callback("p1", "ref", "hash")).toEqual({ url: `${WEB}/buyer/projects/p1?harvest_payment=ok`, statusCode: 302 });
    expect(store.projects.get("p1")?.currentStatus).toBe(PROJECT_STATUS.MARKET_PAYMENT_HELD);
    expect(await controller.callback("p1", "ref", "hash")).toEqual({ url: `${WEB}/buyer/projects/p1?harvest_payment=error`, statusCode: 302 });
  });
});
