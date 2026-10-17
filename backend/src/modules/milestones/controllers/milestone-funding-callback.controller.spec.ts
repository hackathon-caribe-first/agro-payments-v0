import { GUARDS_METADATA } from "@nestjs/common/constants";
import { CompleteFundingUseCase } from "../application/complete-funding.use-case";
import { FakeFunding, storeWith, unfundedMilestone } from "../application/testing";
import { MilestoneFundingCallbackController } from "./milestone-funding-callback.controller";

const WEB = "http://web.test";
const setup = (funding = new FakeFunding()) => {
  const store = storeWith(unfundedMilestone());
  return { store, funding, controller: new MilestoneFundingCallbackController(new CompleteFundingUseCase(store, funding), WEB) };
};

describe("MilestoneFundingCallbackController", () => {
  it("has no auth guard: the wallet redirects the browser here, the grant nonce and hash protect it", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MilestoneFundingCallbackController)).toBeUndefined();
    expect(Reflect.getMetadata("path", MilestoneFundingCallbackController.prototype.callback)).toBe(":id/funding/callback");
  });

  it("completes funding and sends the browser back to the operator screen", async () => {
    const { controller, funding, store } = setup();
    expect(await controller.callback("m1", "ref-1", "h")).toEqual({ url: `${WEB}/custodio?funded=m1`, statusCode: 302 });
    expect(funding.completed).toEqual([{ milestoneId: "m1", params: { interactRef: "ref-1", hash: "h" } }]);
    expect((await store.get("m1")).fundedAt).not.toBeNull();
  });

  it("redirects with funding_error when the wallet rejected or the hash does not verify", async () => {
    expect(await setup().controller.callback("m1", undefined, undefined)).toEqual({ url: `${WEB}/custodio?funding_error=m1`, statusCode: 302 });
    const { controller, store } = setup(new FakeFunding(true));
    expect(await controller.callback("m1", "ref-1", "bad")).toEqual({ url: `${WEB}/custodio?funding_error=m1`, statusCode: 302 });
    expect((await store.get("m1")).fundedAt).toBeNull();
  });
});
