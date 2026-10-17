import { ValidationError } from "../../../shared/domain-errors";
import { parseCertifyRequest, parseDeclareRequest } from "./harvest.requests";

const errorsOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof ValidationError) return error.fieldErrors;
    throw error;
  }
  return {};
};

describe("parseDeclareRequest", () => {
  it("maps the wire fields", () => {
    expect(parseDeclareRequest({ quantity_kg: 10_000, quality_grade: " Excelso ", evidence: "Fotos en bodega" })).toEqual({ quantityKg: 10_000, qualityGrade: "Excelso", evidence: "Fotos en bodega" });
  });

  it("rejects fractional or missing kg, an empty grade and short evidence", () => {
    expect(Object.keys(errorsOf(() => parseDeclareRequest({ quantity_kg: 1.5, quality_grade: "", evidence: "x" })))).toEqual(["quantity_kg", "quality_grade", "evidence"]);
  });
});

describe("parseCertifyRequest", () => {
  const base = { certified_quantity_kg: 9_500, quality_grade: "Excelso", notes: "Humedad 11 %" };

  it("maps a fixed price, and the formula with the discount in percent to bps", () => {
    expect(parseCertifyRequest({ ...base, price: { price_per_kg: 12_000 } })).toEqual({ quantityKg: 9_500, qualityGrade: "Excelso", notes: "Humedad 11 %", price: { kind: "fixed", pricePerKg: 12_000 } });
    expect(parseCertifyRequest({ ...base, price: { spot_price_per_kg: 20_000, floor_price_per_kg: 15_000, ceiling_price_per_kg: 25_000, discount_pct: 7.5 } }).price).toEqual({
      kind: "formula",
      spotPerKg: 20_000,
      floorPerKg: 15_000,
      ceilingPerKg: 25_000,
      discountBps: 750,
    });
  });

  it("leaves the price null when omitted (the purchase contract prices it) and notes null when blank", () => {
    expect(parseCertifyRequest({ ...base, notes: " " })).toMatchObject({ price: null, notes: null });
  });

  it("rejects a bad price shape, a floor above the ceiling and a discount out of range", () => {
    expect(Object.keys(errorsOf(() => parseCertifyRequest({ ...base, price: { price_per_kg: 0 } })))).toEqual(["price.price_per_kg"]);
    expect(Object.keys(errorsOf(() => parseCertifyRequest({ ...base, price: { spot_price_per_kg: 1, floor_price_per_kg: 3, ceiling_price_per_kg: 2, discount_pct: 0 } })))).toEqual([
      "price.ceiling_price_per_kg",
    ]);
    expect(Object.keys(errorsOf(() => parseCertifyRequest({ ...base, price: { spot_price_per_kg: 1, floor_price_per_kg: 0, ceiling_price_per_kg: 2, discount_pct: 101 } })))).toEqual([
      "price.discount_pct",
    ]);
  });
});
