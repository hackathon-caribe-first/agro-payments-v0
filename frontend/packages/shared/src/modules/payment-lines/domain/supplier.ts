// Suppliers registry (RF-08): who the producer can pay with a validated wallet address.

export const SUPPLIER_CATEGORIES = ["insumos", "transporte", "maquinaria", "servicios_tecnicos", "otro"] as const;
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

// "desconocido" is the mapper fallback for a wire status this client does not know.
export type SupplierStatus = "validado" | "pendiente" | "rechazado" | "desconocido";

export interface Supplier {
  id: string;
  name: string;
  category: SupplierCategory;
  walletAddress: string;
  assetCode: string;
  assetScale: number;
  publicName: string;
  status: SupplierStatus;
  createdAt: string;
}

// What GET <wallet address> tells us (RF-01 / RF-08): exists, assetCode, assetScale, publicName.
export interface WalletValidation {
  exists: boolean;
  assetCode: string;
  assetScale: number;
  publicName: string;
}

// The platform currency of the projects. Suppliers must be reachable in it.
export const PLATFORM_CURRENCY = { assetCode: "COP", assetScale: 0 } as const;

export const WALLET_CURRENCY_MISMATCH = "La billetera usa otra moneda.";
export const WALLET_NOT_FOUND = "No encontramos esta billetera.";
export const WALLET_URL_INVALID = "Ingresa una billetera válida, por ejemplo https://ilp.interledger-test.dev/nombre.";

// Accepts https://host/path and the payment pointer form $host/path. Returns null for anything else.
export function normalizeWalletUrl(input: string): string | null {
  const text = input.trim();
  if (text === "") return null;
  const candidate = text.startsWith("$") ? `https://${text.slice(1)}` : text;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "" || path === "/") return null;
  return `https://${url.hostname.toLowerCase()}${path}`;
}

// Returns the field error for a validation result against the platform currency, or null when it is usable.
export function walletProblem(validation: WalletValidation, expected: { assetCode: string } = PLATFORM_CURRENCY): string | null {
  if (!validation.exists) return WALLET_NOT_FOUND;
  if (validation.assetCode !== expected.assetCode) return WALLET_CURRENCY_MISMATCH;
  return null;
}
