import { DomainError } from "../../../../shared/domain-errors";
import { createMilestone, LINE_KIND } from "../../application/milestone";
import { SimulatedMilestoneFunding } from "./simulated-milestone-funding.adapter";

const m = () =>
  createMilestone({
    id: "siembra",
    title: "Siembra",
    amount: 100,
    lines: [{ id: "p", kind: LINE_KIND.PRODUCTOR, beneficiary: "P", walletAddress: "https://wallet.test/p", amount: 100 }],
  });

describe("SimulatedMilestoneFunding", () => {
  it("sends the browser straight to the API callback with a fake interact_ref", async () => {
    const { redirectUrl } = await new SimulatedMilestoneFunding("http://api.test").start(m());
    const url = new URL(redirectUrl);
    expect(`${url.origin}${url.pathname}`).toBe("http://api.test/milestones/siembra/funding/callback");
    expect(url.searchParams.get("interact_ref")).toMatch(/^SIM-/);
  });

  it("completes only the interact_ref its own start() issued, once", async () => {
    const funding = new SimulatedMilestoneFunding("http://api.test");
    const interactRef = new URL((await funding.start(m())).redirectUrl).searchParams.get("interact_ref")!;

    await expect(funding.complete("siembra", { interactRef: "SIM-FORGED", hash: "simulated" })).rejects.toThrow(DomainError);
    await expect(funding.complete("siembra", { interactRef, hash: "simulated" })).resolves.toBeUndefined();
    await expect(funding.complete("siembra", { interactRef, hash: "simulated" })).rejects.toThrow(DomainError);
  });

  it("rejects a callback for a milestone whose funding never started", async () => {
    await expect(
      new SimulatedMilestoneFunding("http://api.test").complete("siembra", { interactRef: "SIM-12345678", hash: "simulated" }),
    ).rejects.toThrow(DomainError);
  });

  it("revokes nothing: there is no wallet grant to cancel", async () => {
    await expect(new SimulatedMilestoneFunding("http://api.test").revoke("siembra")).resolves.toBeUndefined();
  });
});
