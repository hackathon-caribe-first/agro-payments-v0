import { randomBytes } from "node:crypto";
import { SecretCipher } from "./secret-cipher";

const key = randomBytes(32).toString("base64");

describe("SecretCipher", () => {
  it("round-trips a secret without leaving it readable in the sealed value", () => {
    const cipher = SecretCipher.fromBase64Key(key);
    const sealed = cipher.encrypt("outgoing-token-123");
    expect(sealed).not.toContain("outgoing-token-123");
    expect(cipher.decrypt(sealed)).toBe("outgoing-token-123");
  });

  it("uses a fresh IV per value, so the same secret never seals the same way twice", () => {
    const cipher = SecretCipher.fromBase64Key(key);
    const [a, b] = [cipher.encrypt("same"), cipher.encrypt("same")];
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });

  it("detects a tampered ciphertext, IV or tag", () => {
    const cipher = SecretCipher.fromBase64Key(key);
    const [version, iv, tag, data] = cipher.encrypt("secret").split(".");
    const flip = (b64: string) => {
      const bytes = Buffer.from(b64, "base64");
      bytes[0] ^= 1;
      return bytes.toString("base64");
    };
    expect(() => cipher.decrypt([version, iv, tag, flip(data)].join("."))).toThrow();
    expect(() => cipher.decrypt([version, flip(iv), tag, data].join("."))).toThrow();
    expect(() => cipher.decrypt([version, iv, flip(tag), data].join("."))).toThrow();
  });

  it("refuses a value sealed with another key", () => {
    const sealed = SecretCipher.fromBase64Key(key).encrypt("secret");
    expect(() => SecretCipher.fromBase64Key(randomBytes(32).toString("base64")).decrypt(sealed)).toThrow();
  });

  it("refuses malformed sealed values and keys that are not 32 bytes", () => {
    const cipher = SecretCipher.fromBase64Key(key);
    expect(() => cipher.decrypt("not-sealed")).toThrow(/sealed/);
    expect(() => SecretCipher.fromBase64Key(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
