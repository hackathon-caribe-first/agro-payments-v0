// Supplier registry (PRD v3 RF-15, minimal): who an approved order pays. Pure types and rules: no Nest, no I/O.

import { addFieldError, type FieldErrors, ValidationError } from "../../../shared/domain-errors";

/** Custody pays every line in COP with a fixed receiveAmount (RF-17), so a supplier wallet must receive COP. */
export const SUPPLIER_ASSET = "COP";

export type Supplier = {
  id: string;
  name: string;
  /** The wallet's own id as its GET answered it. */
  walletAddress: string;
  assetCode: string;
  assetScale: number;
  createdAt: Date;
};

export type SupplierInput = { name: string; walletAddress: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Wallet addresses are https URLs (Open Payments); the GET that validates the asset happens in the use case.
export function parseSupplierRequest(body: unknown): SupplierInput {
  const errors: FieldErrors = {};
  const b = isRecord(body) ? body : {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 2 || name.length > 120) addFieldError(errors, "name", "Ingresa el nombre del proveedor (2 a 120 caracteres).");
  const wallet = typeof b.wallet_address === "string" ? b.wallet_address.trim() : "";
  if (!URL.canParse(wallet) || new URL(wallet).protocol !== "https:") addFieldError(errors, "wallet_address", "Ingresa la dirección https de la billetera.");
  if (Object.keys(errors).length > 0) throw new ValidationError(errors, "Invalid supplier payload");
  return { name, walletAddress: wallet };
}
