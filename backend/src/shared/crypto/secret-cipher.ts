import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;

// AES-256-GCM for secrets at rest. Sealed format: `v1.<iv>.<tag>.<ciphertext>` (base64 parts), one random IV per value.
// GCM authenticates: a tampered IV, tag or ciphertext makes decrypt() throw instead of returning garbage.
export class SecretCipher {
  private constructor(private readonly key: Buffer) {}

  static fromBase64Key(base64: string): SecretCipher {
    const key = Buffer.from(base64, "base64");
    if (key.length !== 32) throw new Error("Encryption key must be 32 bytes, base64 encoded");
    return new SecretCipher(key);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data].map((part) => (typeof part === "string" ? part : part.toString("base64"))).join(".");
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, data] = sealed.split(".");
    // Never echo the value: it may be a secret.
    if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Not a sealed value");
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  }
}
