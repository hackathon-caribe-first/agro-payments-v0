import { createHash } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import { activeGrant, CUSTODY, GRANT_ACCESS, mockOpenPayments } from "../../../milestones/infrastructure/adapters/open-payments.testing";
import { approveSettlement } from "../../application/settlement";
import { sampleSettlement } from "../../application/testing";
import { OpenPaymentsLiquidationFunding } from "./open-payments-liquidation-funding.adapter";

const API = "http://api.test";
const COP_CUSTODY = { ...CUSTODY, assetCode: "COP" };
const settlement = () => approveSettlement(sampleSettlement(), "u-fidu", new Date());
const gnapHash = (clientNonce: string, interactRef: string) =>
  createHash("sha256").update(`${clientNonce}\nas-nonce\n${interactRef}\n${CUSTODY.authServer}`).digest("base64");

async function started() {
  const mock = mockOpenPayments([COP_CUSTODY]);
  const funding = new OpenPaymentsLiquidationFunding(mock.op, API);
  const s = settlement();
  const result = await funding.start(s);
  const nonce = (mock.client.grant.request.mock.calls[0][1].interact as { finish: { nonce: string } }).finish.nonce;
  return { ...mock, funding, result, s, clientNonce: nonce };
}

describe("OpenPaymentsLiquidationFunding (RF-26, Fase 3 paso 5)", () => {
  it("is interactive: the fiduciaria approves it in the custody wallet", () => {
    expect(new OpenPaymentsLiquidationFunding(mockOpenPayments().op, API).interactive).toBe(true);
  });

  it("requests one interactive outgoing grant on custody capped at the sum of the COP payouts, finishing on the API callback", async () => {
    const { client, result, s } = await started();
    const total = s.payouts.reduce((sum, p) => sum + p.amount, 0);
    expect(result).toEqual({ redirectUrl: "https://wallet.test/consent" });
    expect(client.grant.request).toHaveBeenCalledWith(
      { url: CUSTODY.authServer },
      expect.objectContaining({
        access_token: {
          access: [
            expect.objectContaining({
              type: "outgoing-payment",
              identifier: CUSTODY.id,
              limits: { debitAmount: { value: String(total), assetCode: "COP", assetScale: 2 } },
            }),
          ],
        },
        interact: expect.objectContaining({ finish: { method: "redirect", uri: `${API}/api/settlements/${s.id}/liquidation-grant/callback`, nonce: expect.any(String) } }),
      }),
    );
  });

  it("stores a pending liquidation grant keyed by the settlement, not ready until the callback verifies", async () => {
    const { grants, funding, s } = await started();
    expect(await grants.findLatestForSettlement(s.id)).toMatchObject({ purpose: "liquidation", settlementId: s.id, milestoneId: null, projectId: s.projectId, status: "pending" });
    expect(await funding.ready(s.id)).toBe(false);
  });

  it("refuses a settlement whose currency is not the custody wallet's asset", async () => {
    const mock = mockOpenPayments([CUSTODY]);
    await expect(new OpenPaymentsLiquidationFunding(mock.op, API).start(settlement())).rejects.toThrow(DomainError);
  });

  it("activates the grant on a verified callback and rejects a forged one", async () => {
    const { funding, s, clientNonce } = await started();
    await expect(funding.complete(s.id, { interactRef: "ref", hash: "forged" })).rejects.toThrow(DomainError);
    await funding.complete(s.id, { interactRef: "ref", hash: gnapHash(clientNonce, "ref") });
    expect(await funding.ready(s.id)).toBe(true);
  });

  it("revokes an active grant once and ignores a settlement without one", async () => {
    const mock = mockOpenPayments([COP_CUSTODY]);
    await mock.grants.save(activeGrant({ purpose: "liquidation", milestoneId: null, settlementId: "s-1" }));
    const funding = new OpenPaymentsLiquidationFunding(mock.op, API);
    await funding.revoke("s-1");
    await funding.revoke("s-1");
    await funding.revoke("other");
    expect(mock.client.grant.cancel).toHaveBeenCalledTimes(1);
    expect(mock.client.grant.cancel).toHaveBeenCalledWith({ url: GRANT_ACCESS.continueUri, accessToken: GRANT_ACCESS.continueToken });
    expect(await funding.ready("s-1")).toBe(false);
  });
});
