import { DomainError } from "../../../../shared/domain-errors";
import { amount, CUSTODY, mockOpenPayments } from "../../../milestones/infrastructure/adapters/open-payments.testing";
import { OpenPaymentsIndemnityInflow } from "./open-payments-indemnity-inflow.adapter";

const COP_CUSTODY = { ...CUSTODY, assetCode: "COP" };
const order = { claimId: "c-1", projectId: "p-1", amount: 130_000_000, currency: "COP", assetScale: 2 };

describe("OpenPaymentsIndemnityInflow (RF-25, request #26)", () => {
  it("opens an incoming payment on custody for the exact indemnity with a non-interactive grant, and returns its URL", async () => {
    const { op, client, calls } = mockOpenPayments([COP_CUSTODY]);
    const url = await new OpenPaymentsIndemnityInflow(op).request(order);
    expect(url).toBe("https://rs.receiver.test/incoming-payments/in-1");
    expect(calls).toEqual([`wallet.get ${CUSTODY.id}`, `grant.request ${CUSTODY.authServer} incoming-payment`, `incomingPayment.create ${CUSTODY.resourceServer}`]);
    expect(client.incomingPayment.create).toHaveBeenCalledWith(
      { url: CUSTODY.resourceServer, accessToken: "incoming-payment-token" },
      { walletAddress: CUSTODY.id, incomingAmount: { value: "130000000", assetCode: "COP", assetScale: 2 }, metadata: { project: "p-1", claim: "c-1", concept: "indemnizacion" } },
    );
  });

  it("refuses when custody does not hold the claim's asset", async () => {
    const { op } = mockOpenPayments([CUSTODY]);
    await expect(new OpenPaymentsIndemnityInflow(op).request(order)).rejects.toThrow(DomainError);
  });

  it("reads what the incoming payment received, in minor units", async () => {
    const { op, client } = mockOpenPayments([COP_CUSTODY]);
    client.incomingPayment.get.mockResolvedValueOnce({ id: "https://rs/in-1", completed: true, receivedAmount: amount("130000000") });
    expect(await new OpenPaymentsIndemnityInflow(op).received("https://rs/in-1")).toBe(130_000_000);
  });
});
