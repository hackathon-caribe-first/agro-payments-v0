import { z } from "zod";
import { isoDate, positiveInt } from "./fields";

export const buildRespondQuoteSchema = ({ requested, available, today }: { requested: number; available: number; today: string }) => {
  const max = Math.min(requested, available);
  return z.object({
    unitPrice: positiveInt("Precio unitario"),
    quantity: positiveInt("Cantidad").refine((q) => q <= max, {
      error: available < requested ? `Supera la cantidad disponible (${available}).` : `Supera la cantidad solicitada (${requested}).`,
    }),
    validUntil: isoDate("Ingresa una fecha de vigencia válida.").refine((d) => d > today, {
      error: "La vigencia debe ser posterior a hoy.",
    }),
    deliveryTerms: z.string({ error: "Ingresa las condiciones." }).trim().min(5, { error: "Las condiciones deben tener al menos 5 caracteres." }).max(500, { error: "Máximo 500 caracteres." }),
  });
};

export type RespondQuoteInput = z.output<ReturnType<typeof buildRespondQuoteSchema>>;

// Accept/reject carry only the revision (hidden input); a string is coerced to a positive integer.
export const revisionSchema = z.coerce.number({ error: "Revisión inválida." }).int().positive({ error: "Revisión inválida." });
