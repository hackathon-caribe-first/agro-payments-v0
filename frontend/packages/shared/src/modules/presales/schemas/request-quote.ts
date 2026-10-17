import { z } from "zod";
import { isoDate, positiveInt } from "./fields";

export const buildRequestQuoteSchema = ({ available, today }: { available: number; today: string }) =>
  z.object({
    quantity: positiveInt("Cantidad").refine((q) => q <= available, { error: `Supera la cantidad disponible (${available}).` }),
    desiredDeliveryDate: isoDate("Ingresa una fecha de entrega válida.").refine((d) => d >= today, {
      error: "La fecha de entrega no puede ser anterior a hoy.",
    }),
    notes: z.string({ error: "Las notas deben ser texto." }).trim().max(500, { error: "Máximo 500 caracteres." }),
  });

export type RequestQuoteInput = z.output<ReturnType<typeof buildRequestQuoteSchema>>;
