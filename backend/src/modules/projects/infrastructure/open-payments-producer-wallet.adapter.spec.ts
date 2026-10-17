import { ValidationError } from "../../../shared/domain-errors";
import { mockOpenPayments } from "../../milestones/infrastructure/adapters/open-payments.testing";
import { OpenPaymentsProducerWalletCheck } from "./open-payments-producer-wallet.adapter";

const COP_WALLET = { id: "https://ilp.test/productor", authServer: "https://auth.test", resourceServer: "https://rs.test", assetCode: "COP", assetScale: 2 };
const USD_WALLET = { ...COP_WALLET, id: "https://ilp.test/usd", assetCode: "USD" };

describe("OpenPaymentsProducerWalletCheck (RF-01)", () => {
  const check = () => {
    const mock = mockOpenPayments([COP_WALLET, USD_WALLET]);
    return { ...mock, wallets: new OpenPaymentsProducerWalletCheck(mock.op) };
  };

  it("accepts a COP wallet after a GET on it", async () => {
    const { wallets, calls } = check();
    await expect(wallets.verify(COP_WALLET.id)).resolves.toBeUndefined();
    expect(calls).toEqual([`wallet.get ${COP_WALLET.id}`]);
  });

  it("refuses a wallet in another asset on producerWalletAddress", async () => {
    const error = await check().wallets.verify(USD_WALLET.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toEqual({ producerWalletAddress: ["La billetera no recibe pesos colombianos (COP)."] });
  });

  it("refuses a wallet that does not answer", async () => {
    const error = await check().wallets.verify("https://ilp.test/missing").catch((e: unknown) => e);
    expect((error as ValidationError).fieldErrors).toEqual({ producerWalletAddress: ["No pudimos leer esa billetera. Revisa la dirección."] });
  });
});
