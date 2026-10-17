import { DomainError, ValidationError } from "../../../shared/domain-errors";
import { MAX_PIN_ATTEMPTS, PinUseCase } from "./pin";
import { FakePinStore } from "./testing";

const setup = () => {
  const store = new FakePinStore();
  return { store, pins: new PinUseCase(store) };
};

describe("PinUseCase", () => {
  it("stores a salted scrypt hash, never the PIN itself", async () => {
    const { store, pins } = setup();
    await pins.set("u1", { pin: "1234" });
    await pins.set("u2", { pin: "1234" });
    const [a, b] = [await store.find("u1"), await store.find("u2")];
    expect(a!.hash).not.toContain("1234");
    expect(a!.salt).not.toBe(b!.salt);
    expect(a!.hash).not.toBe(b!.hash);
  });

  it("accepts only four digits", async () => {
    const { pins } = setup();
    for (const pin of ["123", "12345", "12a4", "", undefined]) await expect(pins.set("u1", { pin })).rejects.toThrow(ValidationError);
  });

  it("verifies the right PIN and rejects a wrong one with the attempts left", async () => {
    const { pins } = setup();
    await pins.set("u1", { pin: "1234" });
    await expect(pins.verify("u1", "1234")).resolves.toBeUndefined();
    const error = await pins.verify("u1", "0000").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors.pin[0]).toMatch(/4 intentos/);
  });

  it(`locks after ${MAX_PIN_ATTEMPTS} failed attempts, even for the right PIN, and a success resets the count`, async () => {
    const { pins, store } = setup();
    await pins.set("u1", { pin: "1234" });
    await pins.verify("u1", "0000").catch(() => {});
    await pins.verify("u1", "1234");
    expect((await store.find("u1"))!.failedAttempts).toBe(0);
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) await pins.verify("u1", "0000").catch(() => {});
    await expect(pins.verify("u1", "1234")).rejects.toThrow(/bloqueado/);
  });

  it("refuses to verify when no PIN is set, and to change a PIN without the current one", async () => {
    const { pins } = setup();
    await expect(pins.verify("u1", "1234")).rejects.toThrow(DomainError);
    await pins.set("u1", { pin: "1234" });
    await expect(pins.set("u1", { pin: "9999" })).rejects.toThrow(ValidationError);
    await expect(pins.set("u1", { pin: "9999", currentPin: "0000" })).rejects.toThrow(ValidationError);
    await pins.set("u1", { pin: "9999", currentPin: "1234" });
    await expect(pins.verify("u1", "9999")).resolves.toBeUndefined();
  });

  it("reports whether a PIN is set", async () => {
    const { pins } = setup();
    expect(await pins.status("u1")).toEqual({ pinSet: false, locked: false });
    await pins.set("u1", { pin: "1234" });
    expect(await pins.status("u1")).toEqual({ pinSet: true, locked: false });
  });
});
