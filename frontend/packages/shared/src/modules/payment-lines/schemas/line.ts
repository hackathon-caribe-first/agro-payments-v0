import { z } from "zod";
import { AMOUNT_MODES, LINE_CONCEPTS, PAYMENT_MOMENTS, type AmountMode, type LineConcept, type PaymentMoment } from "../domain/line";
import { parseMinorUnits, parsePercentBps } from "../domain/money";

export const REFERENCE_MAX = 40;

export interface LineInput {
  beneficiaryId: string;
  concept: LineConcept;
  reference: string;
  amountMode: AmountMode;
  // Minimal units when fixed; basis points when percent.
  value: number;
  moment: PaymentMoment;
}

// The form sends text; `scale` decides how a fixed amount is read. Cross-field rules (cap, beneficiary vs concept)
// run in the use case, where the milestone and the existing lines are known.
export function buildLineInputSchema({ scale }: { scale: number }) {
  return z
    .object({
      beneficiaryId: z.string({ error: "Selecciona el beneficiario." }).min(1, { error: "Selecciona el beneficiario." }),
      concept: z.enum(LINE_CONCEPTS, { error: "Selecciona el concepto." }),
      reference: z.string().trim().max(REFERENCE_MAX, { error: `Máximo ${REFERENCE_MAX} caracteres.` }).default(""),
      amountMode: z.enum(AMOUNT_MODES, { error: "Selecciona cómo se define el monto." }),
      amount: z.string({ error: "Ingresa el monto." }),
      moment: z.enum(PAYMENT_MOMENTS, { error: "Selecciona el momento de pago." }),
    })
    .superRefine((input, ctx) => {
      if ((input.concept === "factura" || input.concept === "orden") && input.reference === "") {
        ctx.addIssue({ code: "custom", path: ["reference"], message: input.concept === "factura" ? "Ingresa el número de la factura." : "Ingresa el número de la orden." });
      }
    })
    .transform((input, ctx): LineInput => {
      const value = input.amountMode === "percent" ? parsePercentBps(input.amount) : parseMinorUnits(input.amount, scale);
      if (value === null) {
        const message =
          input.amountMode === "percent"
            ? "Ingresa un porcentaje válido, con hasta dos decimales."
            : scale === 0
              ? "Ingresa un monto válido, en pesos enteros."
              : "Ingresa un monto válido, con hasta dos decimales.";
        ctx.issues.push({ code: "custom", message, path: ["amount"], input: input.amount });
        return z.NEVER;
      }
      return { beneficiaryId: input.beneficiaryId, concept: input.concept, reference: input.reference, amountMode: input.amountMode, value, moment: input.moment };
    });
}
