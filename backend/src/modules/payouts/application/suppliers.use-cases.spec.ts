import { DomainError, ValidationError } from "../../../shared/domain-errors";
import { SuppliersUseCases } from "./suppliers.use-cases";
import { FakeWalletDirectory, InMemorySupplierRepository } from "./testing";

const PEDRO = "https://ilp.test/pedro";
const setup = () => {
  const repo = new InMemorySupplierRepository();
  const wallets = new FakeWalletDirectory({ [PEDRO]: { assetCode: "COP", assetScale: 2 }, "https://ilp.test/usd": { assetCode: "USD", assetScale: 2 } });
  return { repo, useCases: new SuppliersUseCases(repo, wallets) };
};

// RF-15 (minimal): suppliers with a wallet validated by a GET; the custody pays in COP, so the wallet must hold COP.
describe("SuppliersUseCases.register", () => {
  it("stores a supplier whose wallet resolves in COP, with the wallet's canonical id and asset", async () => {
    const { useCases, repo } = setup();
    const supplier = await useCases.register({ name: "  Almacén Don Pedro ", wallet_address: PEDRO });
    expect(supplier).toMatchObject({ name: "Almacén Don Pedro", walletAddress: PEDRO, assetCode: "COP", assetScale: 2 });
    expect(await repo.findAll()).toEqual([supplier]);
  });

  it("rejects (400) a missing name, a non-https wallet, a wallet that does not resolve and one not in COP", async () => {
    const { useCases } = setup();
    const fields = async (body: unknown) => useCases.register(body).catch((e: unknown) => (e instanceof ValidationError ? e.fieldErrors : e));
    expect(await fields({ name: "", wallet_address: PEDRO })).toHaveProperty("name");
    expect(await fields({ name: "Agro", wallet_address: "http://ilp.test/pedro" })).toHaveProperty("wallet_address");
    expect(await fields({ name: "Agro", wallet_address: "https://ilp.test/nadie" })).toEqual({ wallet_address: ["No encontramos esa billetera. Revisa la dirección."] });
    expect(await fields({ name: "Agro", wallet_address: "https://ilp.test/usd" })).toEqual({ wallet_address: ["La billetera debe recibir pesos colombianos (COP); esta recibe USD."] });
    expect(await fields(null)).toHaveProperty("name");
  });

  it("refuses (409) a second supplier with the same name, ignoring case", async () => {
    const { useCases } = setup();
    await useCases.register({ name: "Almacén Don Pedro", wallet_address: PEDRO });
    await expect(useCases.register({ name: "almacén don pedro", wallet_address: PEDRO })).rejects.toThrow(DomainError);
  });
});
