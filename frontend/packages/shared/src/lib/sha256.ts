// RF-19/RF-35: photo fingerprints computed in the browser with Web Crypto (no dependency). crypto.subtle only exists in a
// secure context (https or localhost); callers handle the rejection.
const SHA256_HEX = /^[0-9a-f]{64}$/;

export const toHex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(data: BufferSource): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is not available in this context");
  return toHex(await globalThis.crypto.subtle.digest("SHA-256", data));
}

/** Same rule as the backend: 64 lowercase hex characters. */
export const isSha256Hex = (value: string): boolean => SHA256_HEX.test(value);
