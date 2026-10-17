import { ValidationError } from "../../../shared/domain-errors";
import { parseSettlementRequest } from "./settlement.requests";

const body = () => ({
  proceeds: 2_000_000,
  integrator_debt: 100_000,
  integrator_wallet_address: "https://wallet.test/integrador",
  producer_contribution: 200_000,
  days: 120,
  investors: [
    { id: "inv-cop", capital: 600_000, currency: "COP", wallet_address: "https://wallet.test/cop" },
    { id: "inv-eur", capital: 400_000, currency: "EUR", wallet_address: "https://wallet.test/eur" },
  ],
});

const errorsOf = (input: unknown) => {
  try {
    parseSettlementRequest(input);
  } catch (error) {
    if (error instanceof ValidationError) return error.fieldErrors;
    throw error;
  }
  throw new Error("expected a ValidationError");
};

describe("parseSettlementRequest", () => {
  it("turns whole pesos into minor units (assetScale 2) and snake_case into the domain terms", () => {
    expect(parseSettlementRequest(body())).toEqual({
      proceeds: 200_000_000,
      integratorDebt: 10_000_000,
      integratorWalletAddress: "https://wallet.test/integrador",
      producerContribution: 20_000_000,
      days: 120,
      investors: [
        { id: "inv-cop", capital: 60_000_000, currency: "COP", walletAddress: "https://wallet.test/cop" },
        { id: "inv-eur", capital: 40_000_000, currency: "EUR", walletAddress: "https://wallet.test/eur" },
      ],
    });
  });

  it("defaults the optional parts: no integrator, no producer contribution, d from the project", () => {
    const { proceeds, investors } = body();
    expect(parseSettlementRequest({ proceeds, investors })).toMatchObject({ integratorDebt: 0, integratorWalletAddress: null, producerContribution: 0, days: null });
  });

  it("leaves investors null when the body omits them: the captured investments fill the capital tier (RF-10)", () => {
    const { proceeds } = body();
    expect(parseSettlementRequest({ proceeds }).investors).toBeNull();
  });

  it("rejects a body that is not an object", () => {
    expect(errorsOf([])).toEqual({ _form: ["La solicitud no tiene el formato esperado."] });
  });

  it.each([
    { name: "negative proceeds", patch: { proceeds: -1 }, path: "proceeds" },
    { name: "fractional proceeds", patch: { proceeds: 1.5 }, path: "proceeds" },
    { name: "missing proceeds", patch: { proceeds: undefined }, path: "proceeds" },
    { name: "debt as text", patch: { integrator_debt: "100" }, path: "integrator_debt" },
    { name: "debt without wallet", patch: { integrator_wallet_address: undefined }, path: "integrator_wallet_address" },
    { name: "http integrator wallet", patch: { integrator_wallet_address: "http://wallet.test/i" }, path: "integrator_wallet_address" },
    { name: "negative contribution", patch: { producer_contribution: -5 }, path: "producer_contribution" },
    { name: "fractional days", patch: { days: 1.5 }, path: "days" },
    { name: "no investors", patch: { investors: [] }, path: "investors" },
  ])("$name → error on $path", ({ patch, path }) => {
    expect(Object.keys(errorsOf({ ...body(), ...patch }))).toEqual([path]);
  });

  it.each([
    { name: "zero capital", investor: { capital: 0 }, path: "investors.1.capital" },
    { name: "bad currency", investor: { currency: "euro" }, path: "investors.1.currency" },
    { name: "non-https wallet", investor: { wallet_address: "ftp://w.test/x" }, path: "investors.1.wallet_address" },
    { name: "empty id", investor: { id: "" }, path: "investors.1.id" },
    { name: "duplicate id", investor: { id: "inv-cop" }, path: "investors.1.id" },
  ])("investor with $name → error on $path", ({ investor, path }) => {
    const b = body();
    b.investors[1] = { ...b.investors[1], ...investor } as (typeof b.investors)[number];
    expect(Object.keys(errorsOf(b))).toEqual([path]);
  });
});
