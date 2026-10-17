import { DomainError } from "../../../../shared/domain-errors";
import { INVESTMENT_STATUS, type Investment } from "../../domain/investment";
import { SimulatedInvestmentCapture } from "./simulated-investment-capture.adapter";

const NOW = new Date("2026-10-17T12:00:00.000Z");
const investment: Investment = {
  id: "inv-1",
  projectId: "p1",
  investorUserId: "u-inv",
  walletAddress: "https://ilp.test/inversionista_eur",
  status: INVESTMENT_STATUS.PENDING_CONSENT,
  failureReason: null,
  amount: 10_000_000,
  currency: "COP",
  assetScale: 2,
  quote: null,
  impliedRate: null,
  incomingPaymentId: null,
  outgoingPaymentId: null,
  createdAt: NOW,
  capturedAt: null,
};

describe("SimulatedInvestmentCapture", () => {
  const capture = new SimulatedInvestmentCapture({ now: () => NOW });

  it("reads the wallet currency from a _usd / -eur suffix (the PRD's …/inversionista_usd naming); anything else is COP", async () => {
    expect(await capture.wallet("https://ilp.test/inversionista_usd")).toEqual({ id: "https://ilp.test/inversionista_usd", assetCode: "USD", assetScale: 2 });
    expect(await capture.wallet("https://ilp.test/maria-EUR")).toMatchObject({ assetCode: "EUR" });
    expect(await capture.wallet("https://ilp.test/inversionista_n")).toMatchObject({ assetCode: "COP" });
  });

  it("captures at once with the fixed simulated rate, without network", async () => {
    const wallet = await capture.wallet(investment.walletAddress);
    expect(await capture.start(investment, wallet)).toEqual({
      kind: "captured",
      quote: expect.objectContaining({ debitAmount: 2_273, debitAssetCode: "EUR", receiveAmount: 10_000_000 }),
      incomingPaymentId: null,
      outgoingPaymentId: "SIM-CAPTURE-inv-1",
    });
  });

  it("has no wallet callback to complete", async () => {
    await expect(capture.complete()).rejects.toThrow(DomainError);
  });
});
