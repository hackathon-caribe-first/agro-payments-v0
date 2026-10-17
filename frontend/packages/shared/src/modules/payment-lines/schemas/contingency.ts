import { z } from "zod";
import { parseMinorUnits } from "../domain/money";

export const CONTINGENCY_REASON_MAX = 120;

export interface ContingencyInput {
  beneficiaryId: string;
  // Minimal units.
  value: number;
  reason: string;
}

// RF-21: the form sends text; `scale` decides how the amount is read. The reserve limit runs in the use case, where the lines are known.
export function buildContingencyInputSchema({ scale }: { scale: number }) {
  return z
    .object({
      beneficiaryId: z.string({ error: "Selecciona el beneficiario." }).min(1, { error: "Selecciona el beneficiario." }),
      amount: z.string({ error: "Ingresa el monto." }),
      reason: z
        .string({ error: "Cuéntanos el motivo del imprevisto." })
        .trim()
        .min(1, { error: "Cuéntanos el motivo del imprevisto." })
        .max(CONTINGENCY_REASON_MAX, { error: `Máximo ${CONTINGENCY_REASON_MAX} caracteres.` }),
    })
    .transform((input, ctx): ContingencyInput => {
      const value = parseMinorUnits(input.amount, scale);
      if (value === null || value < 1) {
        ctx.issues.push({
          code: "custom",
          message: scale === 0 ? "Ingresa un monto válido, en pesos enteros." : "Ingresa un monto válido, con hasta dos decimales.",
          path: ["amount"],
          input: input.amount,
        });
        return z.NEVER;
      }
      return { beneficiaryId: input.beneficiaryId, value, reason: input.reason };
    });
}
