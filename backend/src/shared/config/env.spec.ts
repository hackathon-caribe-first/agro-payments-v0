import { parseDemoIdentity } from "./env";

describe("DEMO_IDENTITY", () => {
  it("is off unless explicitly true", () => {
    expect(parseDemoIdentity(undefined)).toBe(false);
    expect(parseDemoIdentity("")).toBe(false);
    expect(parseDemoIdentity("false")).toBe(false);
    expect(parseDemoIdentity("true")).toBe(true);
  });

  it("refuses anything else instead of guessing", () => {
    expect(() => parseDemoIdentity("yes")).toThrow(/DEMO_IDENTITY/);
    expect(() => parseDemoIdentity("1")).toThrow(/DEMO_IDENTITY/);
  });
});
