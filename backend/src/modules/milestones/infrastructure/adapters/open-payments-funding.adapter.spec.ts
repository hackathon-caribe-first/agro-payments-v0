import { createHash } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import { createMilestone, LINE_KIND } from "../../application/milestone";
import { OpenPaymentsFunding } from "./open-payments-funding.adapter";
import { activeGrant, CUSTODY, GRANT_ACCESS, mockOpenPayments } from "./open-payments.testing";

const API = "http://api.test";
const milestone = () =>
  createMilestone({
    id: "m1",
    title: "Siembra",
    amount: 10_000,
    currency: "USD",
    assetScale: 2,
    lines: [{ id: "l-prod", kind: LINE_KIND.PRODUCTOR, beneficiary: "Productor", walletAddress: "https://ilp.test/receiver", amount: 10_000 }],
  });

// GNAP finish hash: base64(sha256(clientNonce \n asFinishNonce \n interactRef \n grantEndpoint)).
const gnapHash = (clientNonce: string, interactRef: string, grantEndpoint: string) =>
  createHash("sha256").update(`${clientNonce}\nas-nonce\n${interactRef}\n${grantEndpoint}`).digest("base64");

async function started() {
  const mock = mockOpenPayments();
  const funding = new OpenPaymentsFunding(mock.op, API);
  const result = await funding.start(milestone());
  const nonce = mock.client.grant.request.mock.calls[0][1].interact as { finish: { nonce: string } };
  return { ...mock, funding, result, clientNonce: nonce.finish.nonce };
}

describe("OpenPaymentsFunding", () => {
  it("requests one interactive outgoing grant on the custody wallet, capped at the milestone amount, finishing on the API callback", async () => {
    const { client, result } = await started();

    expect(result).toEqual({ redirectUrl: "https://wallet.test/consent" });
    expect(client.grant.request).toHaveBeenCalledWith(
      { url: CUSTODY.authServer },
      {
        access_token: {
          access: [
            {
              type: "outgoing-payment",
              actions: ["create", "read", "list"],
              identifier: CUSTODY.id,
              limits: { debitAmount: { value: "10000", assetCode: "USD", assetScale: 2 } },
            },
          ],
        },
        interact: {
          start: ["redirect"],
          finish: { method: "redirect", uri: `${API}/milestones/m1/funding/callback`, nonce: expect.any(String) },
        },
      },
    );
  });

  it("stores a pending milestone grant that records the payer wallet, asset and debit limit", async () => {
    const { grants, clientNonce } = await started();
    expect(await grants.findLatestForMilestone("m1")).toMatchObject({
      purpose: "milestone",
      projectId: null,
      milestoneId: "m1",
      payerWalletAddress: CUSTODY.id,
      assetCode: "USD",
      assetScale: 2,
      debitLimit: 10_000,
      status: "pending",
      pending: { clientNonce, finishNonce: "as-nonce", continueUri: `${CUSTODY.authServer}/continue/1`, continueToken: "continue-token", authServer: CUSTODY.authServer },
      access: null,
      revokedAt: null,
    });
  });

  it("refuses a milestone whose currency is not the custody wallet's asset", async () => {
    const { op, client } = mockOpenPayments();
    const cop = { ...milestone(), currency: "COP" };
    await expect(new OpenPaymentsFunding(op, API).start(cop)).rejects.toThrow(DomainError);
    expect(client.grant.request).not.toHaveBeenCalled();
  });

  it("verifies the hash against the grant endpoint without a trailing slash, then activates the grant with its continue handle", async () => {
    const { funding, client, grants, clientNonce } = await started();

    await funding.complete("m1", { interactRef: "ref-1", hash: gnapHash(clientNonce, "ref-1", CUSTODY.authServer) });

    expect(client.grant.continue).toHaveBeenCalledWith(
      { url: `${CUSTODY.authServer}/continue/1`, accessToken: "continue-token" },
      { interact_ref: "ref-1" },
    );
    expect(await grants.findLatestForMilestone("m1")).toMatchObject({ status: "active", pending: null, access: GRANT_ACCESS });
  });

  it("also accepts the hash computed with a trailing slash on the grant endpoint", async () => {
    const { funding, grants, clientNonce } = await started();
    await funding.complete("m1", { interactRef: "ref-1", hash: gnapHash(clientNonce, "ref-1", `${CUSTODY.authServer}/`) });
    expect((await grants.findLatestForMilestone("m1"))?.status).toBe("active");
  });

  it("rejects a mismatched or missing hash without continuing the grant, keeping it pending", async () => {
    const { funding, client, grants, clientNonce } = await started();

    await expect(funding.complete("m1", { interactRef: "ref-1", hash: gnapHash(clientNonce, "other-ref", CUSTODY.authServer) })).rejects.toThrow(DomainError);
    await expect(funding.complete("m1", { interactRef: "ref-1", hash: null })).rejects.toThrow(DomainError);

    expect(client.grant.continue).not.toHaveBeenCalled();
    expect(await grants.findLatestForMilestone("m1")).toMatchObject({ status: "pending", access: null });
  });

  it("rejects a callback for a milestone with no funding in progress", async () => {
    const { op } = mockOpenPayments();
    await expect(new OpenPaymentsFunding(op, API).complete("m1", { interactRef: "ref-1", hash: "h" })).rejects.toThrow(DomainError);
  });

  it("rejects a replayed callback once the grant is active", async () => {
    const { funding, client, clientNonce } = await started();
    const callback = { interactRef: "ref-1", hash: gnapHash(clientNonce, "ref-1", CUSTODY.authServer) };
    await funding.complete("m1", callback);
    await expect(funding.complete("m1", callback)).rejects.toThrow(DomainError);
    expect(client.grant.continue).toHaveBeenCalledTimes(1);
  });

  it("finishes a funding started before a restart: the pending grant lives in the store, not in the adapter", async () => {
    const { op, grants, clientNonce } = await started();
    const afterRestart = new OpenPaymentsFunding(op, API);
    await afterRestart.complete("m1", { interactRef: "ref-1", hash: gnapHash(clientNonce, "ref-1", CUSTODY.authServer) });
    expect((await grants.findLatestForMilestone("m1"))?.status).toBe("active");
  });
});

describe("OpenPaymentsFunding.revoke (RF-22)", () => {
  const funded = async () => {
    const mock = mockOpenPayments();
    await mock.grants.save(activeGrant());
    return { ...mock, funding: new OpenPaymentsFunding(mock.op, API) };
  };

  it("cancels the grant with its continue URI and token, then marks it revoked", async () => {
    const { funding, client, grants } = await funded();

    await funding.revoke("m1");

    expect(client.grant.cancel).toHaveBeenCalledWith({ url: GRANT_ACCESS.continueUri, accessToken: GRANT_ACCESS.continueToken });
    expect(await grants.findLatestForMilestone("m1")).toMatchObject({ status: "revoked", revokedAt: expect.any(Date) });
  });

  it("cancels exactly once: revoking an already revoked grant does not reach the wallet", async () => {
    const { funding, client } = await funded();
    await funding.revoke("m1");
    await funding.revoke("m1");
    expect(client.grant.cancel).toHaveBeenCalledTimes(1);
  });

  it("keeps the grant active when the wallet refuses, so a later revoke retries", async () => {
    const { funding, client, grants } = await funded();
    client.grant.cancel.mockRejectedValueOnce(new Error("auth server down"));

    await expect(funding.revoke("m1")).rejects.toThrow("auth server down");
    expect((await grants.findLatestForMilestone("m1"))?.status).toBe("active");

    await funding.revoke("m1");
    expect(client.grant.cancel).toHaveBeenCalledTimes(2);
    expect((await grants.findLatestForMilestone("m1"))?.status).toBe("revoked");
  });

  it("does nothing for a milestone that never got an active grant", async () => {
    const { op, client } = mockOpenPayments();
    await new OpenPaymentsFunding(op, API).revoke("m1");
    expect(client.grant.cancel).not.toHaveBeenCalled();
  });
});
