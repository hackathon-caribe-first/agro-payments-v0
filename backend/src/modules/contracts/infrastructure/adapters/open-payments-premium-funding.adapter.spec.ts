import { createHash } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import { activeGrant, CUSTODY, GRANT_ACCESS, mockOpenPayments } from "../../../milestones/infrastructure/adapters/open-payments.testing";
import { OpenPaymentsPremiumFunding } from "./open-payments-premium-funding.adapter";

const API = "http://api.test";
const COP_CUSTODY = { ...CUSTODY, assetCode: "COP" };
const order = { projectId: "p-1", amount: 15_000_000, currency: "COP", assetScale: 2 };
const gnapHash = (clientNonce: string, interactRef: string) =>
  createHash("sha256").update(`${clientNonce}\nas-nonce\n${interactRef}\n${CUSTODY.authServer}`).digest("base64");

async function started() {
  const mock = mockOpenPayments([COP_CUSTODY]);
  const funding = new OpenPaymentsPremiumFunding(mock.op, API);
  const result = await funding.start(order);
  const nonce = (mock.client.grant.request.mock.calls[0][1].interact as { finish: { nonce: string } }).finish.nonce;
  return { ...mock, funding, result, clientNonce: nonce };
}

describe("OpenPaymentsPremiumFunding (RF-14, Fase 1 paso 6)", () => {
  it("requests one interactive outgoing grant on custody capped at the net premium, finishing on the API callback", async () => {
    const { client, result, funding } = await started();
    expect(funding.interactive).toBe(true);
    expect(result).toEqual({ redirectUrl: "https://wallet.test/consent" });
    expect(client.grant.request).toHaveBeenCalledWith(
      { url: CUSTODY.authServer },
      expect.objectContaining({
        access_token: {
          access: [expect.objectContaining({ type: "outgoing-payment", identifier: CUSTODY.id, limits: { debitAmount: { value: "15000000", assetCode: "COP", assetScale: 2 } } })],
        },
        interact: expect.objectContaining({ finish: { method: "redirect", uri: `${API}/api/projects/p-1/insurance-policy/premium-grant/callback`, nonce: expect.any(String) } }),
      }),
    );
  });

  it("stores a pending premium grant keyed by the project, ready only after a verified callback", async () => {
    const { grants, funding, clientNonce } = await started();
    expect(await grants.findLatestForPremium("p-1")).toMatchObject({ purpose: "premium", projectId: "p-1", milestoneId: null, status: "pending" });
    expect(await funding.ready("p-1")).toBe(false);
    await expect(funding.complete("p-1", { interactRef: "ref", hash: "forged" })).rejects.toThrow(DomainError);
    await funding.complete("p-1", { interactRef: "ref", hash: gnapHash(clientNonce, "ref") });
    expect(await funding.ready("p-1")).toBe(true);
  });

  it("refuses a premium whose currency is not the custody wallet's asset", async () => {
    const mock = mockOpenPayments([CUSTODY]);
    await expect(new OpenPaymentsPremiumFunding(mock.op, API).start(order)).rejects.toThrow(DomainError);
  });

  it("revokes an active grant once and ignores a project without one", async () => {
    const mock = mockOpenPayments([COP_CUSTODY]);
    await mock.grants.save(activeGrant({ purpose: "premium", milestoneId: null, projectId: "p-1" }));
    const funding = new OpenPaymentsPremiumFunding(mock.op, API);
    await funding.revoke("p-1");
    await funding.revoke("p-1");
    await funding.revoke("other");
    expect(mock.client.grant.cancel).toHaveBeenCalledTimes(1);
    expect(mock.client.grant.cancel).toHaveBeenCalledWith({ url: GRANT_ACCESS.continueUri, accessToken: GRANT_ACCESS.continueToken });
    expect(await funding.ready("p-1")).toBe(false);
  });
});
