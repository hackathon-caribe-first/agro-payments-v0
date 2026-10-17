import { z } from "zod";
import { SUPPLIER_CATEGORIES, WALLET_URL_INVALID, normalizeWalletUrl, type SupplierCategory } from "../domain/supplier";

export const SUPPLIER_NAME_MAX = 80;

export const supplierInputSchema = z.object({
  name: z
    .string({ error: "Ingresa el nombre del proveedor." })
    .trim()
    .min(2, { error: "El nombre debe tener al menos 2 caracteres." })
    .max(SUPPLIER_NAME_MAX, { error: `Máximo ${SUPPLIER_NAME_MAX} caracteres.` }),
  category: z.enum(SUPPLIER_CATEGORIES, { error: "Selecciona la categoría del proveedor." }),
  walletAddress: z
    .string({ error: "Ingresa la billetera del proveedor." })
    .min(1, { error: "Ingresa la billetera del proveedor." })
    .transform((value, ctx) => {
      const normalized = normalizeWalletUrl(value);
      if (normalized === null) {
        ctx.issues.push({ code: "custom", message: WALLET_URL_INVALID, input: value });
        return z.NEVER;
      }
      return normalized;
    }),
});

export type SupplierInput = { name: string; category: SupplierCategory; walletAddress: string };
