import { z } from "zod";

// The invest form: whole pesos as typed (digits only) and the investor's own https wallet address. Field keys match the API's.
export const investInputSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d+$/, "Ingresa un valor entero en pesos.")
    .transform(Number)
    .refine((n) => Number.isSafeInteger(n) && n > 0, "Ingresa un valor entero en pesos mayor a cero."),
  wallet_address: z
    .string()
    .trim()
    .refine((v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    }, "Ingresa la dirección https de tu billetera."),
});

export type InvestInput = z.output<typeof investInputSchema>;
