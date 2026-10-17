import { ValidationError } from "../../../shared/domain-errors";
import { parseClaim, parsePolicy, parsePurchaseContract } from "./contracts.requests";

const errorsOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error.fieldErrors;
    throw error;
  }
  throw new Error("expected a ValidationError");
};

describe("parsePurchaseContract", () => {
  const body = { price_type: "fixed", price_per_unit: 1300, quantity: 85_000, unit: "kg", currency: "COP", buyer_email: " Comprador@Agro.dev ", buyer_wallet_address: "https://wallet.test/c" };

  it("reads a fixed price in pesos (up to cents) into minor units and trims the buyer email", () => {
    expect(parsePurchaseContract({ ...body, price_per_unit: 1300.5 })).toEqual({
      price: { type: "fixed", pricePerUnit: 130_050 },
      quantity: 85_000,
      unit: "kg",
      currency: "COP",
      buyerEmail: "comprador@agro.dev",
      buyerWalletAddress: "https://wallet.test/c",
    });
  });

  it("reads a formula price and accepts USD (RF-32 is stored, not settled)", () => {
    const formula = { ...body, price_type: "formula", price_per_unit: undefined, floor_per_unit: 1, ceiling_per_unit: 1.5, price_reference: "Bolsa de Chicago", currency: "USD", unit: "t" };
    expect(parsePurchaseContract(formula)).toMatchObject({ price: { type: "formula", floorPerUnit: 100, ceilingPerUnit: 150, reference: "Bolsa de Chicago" }, currency: "USD", unit: "t" });
  });

  it("keys every error by its wire field", () => {
    expect(errorsOf(() => parsePurchaseContract({ price_type: "formula", floor_per_unit: 2, ceiling_per_unit: 1, quantity: 0, unit: "lb", currency: "EUR", buyer_email: "x", buyer_wallet_address: "http://w" }))).toEqual({
      ceiling_per_unit: ["El techo debe ser mayor o igual al piso."],
      price_reference: ["Indica la referencia de la fórmula (por ejemplo, el precio spot)."],
      quantity: ["Ingresa una cantidad entera mayor a cero."],
      unit: ["Elige kg o t."],
      currency: ["Elige COP o USD."],
      buyer_email: ["Ingresa el correo del comprador."],
      buyer_wallet_address: ["Ingresa una dirección de wallet https."],
    });
    expect(errorsOf(() => parsePurchaseContract(null))).toEqual({ _form: ["El cuerpo debe ser un objeto JSON."] });
    expect(errorsOf(() => parsePurchaseContract({ ...body, price_type: "x" }))).toMatchObject({ price_type: ["Elige precio fijo o por fórmula."] });
    expect(errorsOf(() => parsePurchaseContract({ ...body, price_per_unit: 1.234 }))).toMatchObject({ price_per_unit: ["Ingresa un precio mayor a cero, con máximo dos decimales."] });
  });
});

describe("parsePolicy", () => {
  it("defaults the ISA subsidy, threshold and deductible (Anexo A) and leaves the premium terms null when absent", () => {
    expect(parsePolicy({ insurer_name: "Seguros Bolívar", insurer_wallet_address: "https://wallet.test/a" })).toEqual({
      insurerName: "Seguros Bolívar",
      insurerWalletAddress: "https://wallet.test/a",
      grossPremium: null,
      subsidyPct: 85,
      thresholdPct: 70,
      deductiblePct: 10,
      hectares: null,
      expectedYieldKgPerHa: null,
      insuredPricePerKg: null,
      indexTrigger: null,
      indexExit: null,
    });
  });

  it("reads the premium in pesos, the insured price in pesos per kg and the parametric index", () => {
    const parsed = parsePolicy({
      insurer_name: "A",
      insurer_wallet_address: "https://wallet.test/a",
      premium: 1_000_000,
      subsidy_pct: 80,
      hectares: 2.5,
      expected_yield_kg_per_ha: 8_000,
      insured_price_per_kg: 1050,
      index_trigger: 100,
      index_exit: 40,
    });
    expect(parsed).toMatchObject({ grossPremium: 100_000_000, subsidyPct: 80, hectares: 2.5, expectedYieldKgPerHa: 8_000, insuredPricePerKg: 105_000, indexTrigger: 100, indexExit: 40 });
  });

  it("refuses percentages out of range and an index whose exit is not below its trigger", () => {
    expect(errorsOf(() => parsePolicy({ insurer_name: "", insurer_wallet_address: "x", subsidy_pct: 120, index_trigger: 10, index_exit: 10 }))).toEqual({
      insurer_name: ["Ingresa el nombre de la aseguradora."],
      insurer_wallet_address: ["Ingresa una dirección de wallet https."],
      subsidy_pct: ["Ingresa un porcentaje entre 0 y 100."],
      index_exit: ["La salida del índice debe ser menor que el disparo."],
    });
    expect(errorsOf(() => parsePolicy({ insurer_name: "A", insurer_wallet_address: "https://w/a", index_trigger: 10 }))).toEqual({ index_exit: ["Ingresa el disparo y la salida del índice, o ninguno."] });
  });
});

describe("parseClaim", () => {
  it("reads the trigger, observed value and evidence", () => {
    expect(parseClaim({ trigger: "yield", observed_value: 512.5, evidence: " Acta de cosecha " })).toEqual({ trigger: "yield", observedValue: 512.5, evidence: "Acta de cosecha" });
  });

  it("refuses an unknown trigger, a negative observation and empty evidence", () => {
    expect(errorsOf(() => parseClaim({ trigger: "fire", observed_value: -1, evidence: "" }))).toEqual({
      trigger: ["Elige rendimiento o índice."],
      observed_value: ["Ingresa el valor observado, cero o mayor."],
      evidence: ["Describe la evidencia de la pérdida."],
    });
  });
});
