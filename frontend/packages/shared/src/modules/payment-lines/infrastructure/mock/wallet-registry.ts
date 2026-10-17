import { WALLET_URL_INVALID, normalizeWalletUrl, type WalletValidation } from "../../domain/supplier";

// Wallet address hosts the mock "knows": any other host is rejected, like an ASE the platform has not enabled.
export const KNOWN_WALLET_HOSTS = ["ilp.interledger-test.dev", "wallet.interledger-test.dev", "eu1.fynbos.dev"] as const;

export const UNKNOWN_HOST_MESSAGE = "No reconocemos el proveedor de esta billetera. Usa una billetera de un proveedor de cuentas habilitado.";

export type WalletLookup =
  | { kind: "invalid"; message: string }
  | { kind: "ok"; url: string; validation: WalletValidation };

const titleCase = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

// Deterministic answer of GET <wallet address>:
// - last path segment starting with "no-existe" or "missing"  -> the wallet does not exist;
// - ending in "-usd" / "-eur"                                    -> it exists but uses another currency;
// - otherwise                                                    -> COP, scale 0.
export function lookupWallet(raw: string): WalletLookup {
  const url = normalizeWalletUrl(raw);
  if (url === null) return { kind: "invalid", message: WALLET_URL_INVALID };
  const { hostname, pathname } = new URL(url);
  if (!KNOWN_WALLET_HOSTS.some((host) => host === hostname)) return { kind: "invalid", message: UNKNOWN_HOST_MESSAGE };

  const slug = pathname.split("/").filter(Boolean).pop() ?? "";
  if (slug.startsWith("no-existe") || slug.startsWith("missing")) {
    return { kind: "ok", url, validation: { exists: false, assetCode: "", assetScale: 0, publicName: "" } };
  }
  const assetCode = slug.endsWith("-usd") ? "USD" : slug.endsWith("-eur") ? "EUR" : "COP";
  const assetScale = assetCode === "COP" ? 0 : 2;
  return { kind: "ok", url, validation: { exists: true, assetCode, assetScale, publicName: titleCase(slug) } };
}
