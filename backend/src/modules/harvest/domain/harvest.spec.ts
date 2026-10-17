import { DomainError } from "../../../shared/domain-errors";
import { PROJECT_STATUS } from "../../projects/application/project";
import { amountDue, certifyHarvest, confirmReception, declareHarvest, effectivePricePerKg, HARVEST_STATUS, markPaid, nextProjectStatus } from "./harvest";

const at = new Date("2027-03-01T12:00:00Z");
const declared = () =>
  declareHarvest({ projectId: "p1", currentStatus: PROJECT_STATUS.IN_EXECUTION, currency: "COP", assetScale: 2 }, null, {
    quantityKg: 10_000,
    qualityGrade: "Excelso",
    evidence: "Fotos de la cosecha en bodega",
    userId: "u-prod",
    now: at,
  });

describe("effectivePricePerKg (A5: P_g = max(floor, min(ceiling, (1 − d_off)·spot)) or fixed; e_g = 1 in COP)", () => {
  it("takes a fixed price as is", () => {
    expect(effectivePricePerKg({ kind: "fixed", pricePerKg: 12_000 })).toBe(12_000);
  });

  it.each([
    { name: "inside the band", spot: 20_000, expected: 18_000 },
    { name: "below the floor", spot: 10_000, expected: 15_000 },
    { name: "above the ceiling", spot: 30_000, expected: 25_000 },
  ])("clamps the discounted spot: $name", ({ spot, expected }) => {
    expect(effectivePricePerKg({ kind: "formula", spotPerKg: spot, floorPerKg: 15_000, ceilingPerKg: 25_000, discountBps: 1_000 })).toBe(expected);
  });

  it("rounds the discounted spot half up to the whole peso", () => {
    // 10.001 · 0,95 = 9.500,95 → 9.501
    expect(effectivePricePerKg({ kind: "formula", spotPerKg: 10_001, floorPerKg: 0, ceilingPerKg: 1_000_000, discountBps: 500 })).toBe(9_501);
  });

  it("refuses a floor above the ceiling", () => {
    expect(() => effectivePricePerKg({ kind: "formula", spotPerKg: 1, floorPerKg: 3, ceilingPerKg: 2, discountBps: 0 })).toThrow(DomainError);
  });
});

describe("amountDue (Q·P_g in minor units)", () => {
  it("multiplies whole kg by whole pesos and scales to minor units", () => {
    expect(amountDue(10_000, 12_000, 2)).toBe(12_000_000_000);
  });
});

describe("harvest lifecycle", () => {
  it("declares from a funded or executing project: HARVEST_DECLARED", () => {
    const h = declared();
    expect(h).toMatchObject({ status: HARVEST_STATUS.DECLARED, declaredQuantityKg: 10_000, declaredBy: "u-prod", amountDue: null });
    expect(nextProjectStatus(h)).toBe(PROJECT_STATUS.HARVEST_DECLARED);
  });

  it("refuses to declare twice or before custody is funded", () => {
    const project = { projectId: "p1", currentStatus: PROJECT_STATUS.IN_EXECUTION, currency: "COP", assetScale: 2 };
    const input = { quantityKg: 1, qualityGrade: "A", evidence: "x", userId: "u", now: at };
    expect(() => declareHarvest(project, declared(), input)).toThrow(DomainError);
    expect(() => declareHarvest({ ...project, currentStatus: PROJECT_STATUS.FUNDING_IN_PROGRESS }, null, input)).toThrow(DomainError);
  });

  it("certifies Q and quality, prices Q·P_g and moves to HARVEST_CERTIFIED", () => {
    const h = certifyHarvest(declared(), {
      quantityKg: 9_500,
      qualityGrade: "Excelso",
      notes: "Humedad 11 %",
      price: { source: "request", terms: { kind: "fixed", pricePerKg: 12_000 } },
      userId: "u-ver",
      now: at,
    });
    expect(h).toMatchObject({ status: HARVEST_STATUS.CERTIFIED, certifiedQuantityKg: 9_500, certifiedBy: "u-ver", amountDue: 9_500 * 12_000 * 100 });
    expect(h.price).toEqual({ source: "request", terms: { kind: "fixed", pricePerKg: 12_000 }, pricePerKg: 12_000, exchangeFactor: "1/1" });
    expect(nextProjectStatus(h)).toBe(PROJECT_STATUS.HARVEST_CERTIFIED);
  });

  it("pays (MARKET_PAYMENT_HELD) only once certified, then the paying buyer confirms reception (DELIVERED_TO_BUYER)", () => {
    expect(() => markPaid(declared(), "u-buyer", "ref", at)).toThrow(DomainError);
    const certified = certifyHarvest(declared(), { quantityKg: 1, qualityGrade: "A", notes: null, price: { source: "request", terms: { kind: "fixed", pricePerKg: 1 } }, userId: "v", now: at });
    expect(() => confirmReception(certified, "u-buyer", at)).toThrow(DomainError);
    const paid = markPaid(certified, "u-buyer", "ref-1", at);
    expect(paid).toMatchObject({ status: HARVEST_STATUS.PAID, buyerUserId: "u-buyer", paymentReference: "ref-1" });
    expect(nextProjectStatus(paid)).toBe(PROJECT_STATUS.MARKET_PAYMENT_HELD);
    expect(() => confirmReception(paid, "someone-else", at)).toThrow(DomainError);
    const received = confirmReception(paid, "u-buyer", at);
    expect(received).toMatchObject({ status: HARVEST_STATUS.RECEIVED, receivedAt: at });
    expect(nextProjectStatus(received)).toBe(PROJECT_STATUS.DELIVERED_TO_BUYER);
  });
});
