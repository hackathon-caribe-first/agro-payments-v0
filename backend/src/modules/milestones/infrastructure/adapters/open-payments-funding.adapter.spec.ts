import { createHash } from "node:crypto";
import { DomainError } from "../../../../shared/domain-errors";
import { createMilestone, LINE_KIND } from "../../application/milestone";
import { OpenPaymentsFunding } from "./open-payments-funding.adapter";
import { INVESTOR, mockOpenPayments } from "./open-payments.testing";

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
  it("requests one interactive outgoing grant capped at the milestone amount, finishing on the API callback", async () => {
    const { client, result } = await started();

    expect(result).toEqual({ redirectUrl: "https://wallet.test/consent" });
    expect(client.grant.request).toHaveBeenCalledWith(
      { url: INVESTOR.authServer },
      {
        access_token: {
          access: [
            {
              type: "outgoing-payment",
              actions: ["create", "read"],
              identifier: INVESTOR.id,
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

  it("refuses a milestone whose currency is not the investor wallet's asset", async () => {
    const { op, client } = mockOpenPayments();
    const cop = { ...milestone(), currency: "COP" };
    await expect(new OpenPaymentsFunding(op, API).start(cop)).rejects.toThrow(DomainError);
    expect(client.grant.request).not.toHaveBeenCalled();
  });

  it("verifies the hash against the grant endpoint without a trailing slash, then stores the token", async () => {
    const { funding, client, grants, clientNonce } = await started();

    await funding.complete("m1", { interactRef: "ref-1", hash: gnapHash(clientNonce, "ref-1", INVESTOR.authServer) });

    expect(client.grant.continue).toHaveBeenCalledWith(
      { url: `${INVESTOR.authServer}/continue/1`, accessToken: "continue-token" },
      { interact_ref: "ref-1" },
    );
    expect(grants.outgoing.get("m1")).toEqual({ accessToken: "outgoing-token", manageUrl: "https://auth.test/token/out" });
    expect(grants.pending.has("m1")).toBe(false);
  });

  it("also accepts the hash computed with a trailing slash on the grant endpoint", async () => {
    const { funding, grants, clientNonce } = await started();
    await funding.complete("m1", { interactRef: "ref-1", hash: gnapHash(clientNonce, "ref-1", `${INVESTOR.authServer}/`) });
    expect(grants.outgoing.has("m1")).toBe(true);
  });

  it("rejects a mismatched or missing hash without continuing the grant, keeping it pending", async () => {
    const { funding, client, grants, clientNonce } = await started();

    await expect(funding.complete("m1", { interactRef: "ref-1", hash: gnapHash(clientNonce, "other-ref", INVESTOR.authServer) })).rejects.toThrow(DomainError);
    await expect(funding.complete("m1", { interactRef: "ref-1", hash: null })).rejects.toThrow(DomainError);

    expect(client.grant.continue).not.toHaveBeenCalled();
    expect(grants.outgoing.has("m1")).toBe(false);
    expect(grants.pending.has("m1")).toBe(true);
  });

  it("rejects a callback for a milestone with no funding in progress", async () => {
    const { op } = mockOpenPayments();
    await expect(new OpenPaymentsFunding(op, API).complete("m1", { interactRef: "ref-1", hash: "h" })).rejects.toThrow(DomainError);
  });
});
