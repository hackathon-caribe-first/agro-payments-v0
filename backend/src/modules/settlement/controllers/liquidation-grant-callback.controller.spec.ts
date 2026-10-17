import { GUARDS_METADATA } from "@nestjs/common/constants";
import { LiquidationGrantCallbackController } from "./liquidation-grant-callback.controller";

const WEB = "http://web.test";
const setup = (fail = false) => {
  const completed: { id: string; interactRef: string; hash: string | null }[] = [];
  const useCases = {
    completeLiquidationGrant: async (id: string, p: { interactRef: string; hash: string | null }) => {
      if (fail) throw new Error("hash mismatch");
      completed.push({ id, ...p });
    },
  };
  return { completed, controller: new LiquidationGrantCallbackController(useCases as never, WEB) };
};

describe("LiquidationGrantCallbackController", () => {
  it("has no auth guard: the custody wallet redirects the browser here, the grant nonce and GNAP hash protect it", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, LiquidationGrantCallbackController)).toBeUndefined();
    expect(Reflect.getMetadata("path", LiquidationGrantCallbackController)).toBe("api/settlements");
    expect(Reflect.getMetadata("path", LiquidationGrantCallbackController.prototype.callback)).toBe(":id/liquidation-grant/callback");
  });

  it("completes the grant and sends the browser back to the custodian screen", async () => {
    const { controller, completed } = setup();
    expect(await controller.callback("s1", "ref", "h")).toEqual({ url: `${WEB}/custodian?liquidation_granted=s1`, statusCode: 302 });
    expect(completed).toEqual([{ id: "s1", interactRef: "ref", hash: "h" }]);
  });

  it("redirects with liquidation_error when consent was rejected or the hash does not verify", async () => {
    expect(await setup().controller.callback("s1", undefined, undefined)).toEqual({ url: `${WEB}/custodian?liquidation_error=s1`, statusCode: 302 });
    expect(await setup(true).controller.callback("s1", "ref", "bad")).toEqual({ url: `${WEB}/custodian?liquidation_error=s1`, statusCode: 302 });
  });
});
