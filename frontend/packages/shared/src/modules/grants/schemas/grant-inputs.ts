import { z } from "zod";
import { positiveInt } from "../../presales/schemas/fields";
import { REVOCATION_REASONS } from "../domain/grant";

// Input schemas of the grant actions. Messages are es-CO and shown next to the field.

export const requestGrantSchema = z.object({
  milestoneId: z.string({ error: "Elige el hito." }).trim().min(1, { error: "Elige el hito." }),
});
export type RequestGrantInput = z.infer<typeof requestGrantSchema>;

// The wallet consent screen: the investor must be signed in with the account that owns the wallet (PoC lesson).
export const approveGrantSchema = z.object({
  accountConfirmed: z
    .string({ error: "Confirma que usas la cuenta dueña de la billetera." })
    .refine((v) => v === "on" || v === "true", { error: "Confirma que usas la cuenta dueña de la billetera." }),
});
export type ApproveGrantInput = z.infer<typeof approveGrantSchema>;

export const revokeGrantSchema = z.object({
  reason: z.enum(REVOCATION_REASONS, { error: "Elige el motivo de la revocación." }),
});
export type RevokeGrantInput = z.infer<typeof revokeGrantSchema>;

// One split line paid out of the grant. `received` is what the beneficiary gets exactly (RF-10).
export const spendSchema = z.object({
  lineId: z.string({ error: "Indica la línea de pago." }).trim().min(1, { error: "Indica la línea de pago." }),
  concept: z.string({ error: "Indica el concepto." }).trim().min(1, { error: "Indica el concepto." }),
  beneficiary: z.string({ error: "Indica el beneficiario." }).trim().min(1, { error: "Indica el beneficiario." }),
  beneficiaryWallet: z.url({ error: "La billetera del beneficiario debe ser una URL válida." }),
  received: positiveInt("Monto a recibir"),
  // Optional override of the estimated commission (integer, may be 0).
  fee: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v),
    z.number({ error: "Comisión: ingresa un valor numérico." }).int({ error: "Comisión: ingresa un valor entero." }).nonnegative({ error: "Comisión: no puede ser negativa." }).optional(),
  ),
});
export type SpendInput = z.infer<typeof spendSchema>;
