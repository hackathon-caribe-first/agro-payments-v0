import { isSha256Hex, sha256Hex, toHex } from "./sha256";

describe("sha256 helpers (RF-19/RF-35 photo hashes)", () => {
  it("renders bytes as lowercase, zero-padded hex", () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 171, 255]).buffer)).toBe("00010f10abff");
  });

  it("hashes bytes with the platform's Web Crypto (known vectors)", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("accepts only 64 lowercase hex characters, like the backend", () => {
    expect(isSha256Hex("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe(true);
    expect(isSha256Hex("E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855")).toBe(false);
    expect(isSha256Hex("abc")).toBe(false);
  });
});
