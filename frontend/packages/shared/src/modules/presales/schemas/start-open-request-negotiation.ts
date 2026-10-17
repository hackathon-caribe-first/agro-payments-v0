import { z } from "zod";
import { quantityCap } from "../domain/presale-rules";
import { buildCounterOfferSchema, capMessage } from "./counter-offer";
import { optionalIsoDate, positiveInt, isoDate } from "./fields";

interface Options {
  remaining: number;
  today: string;
}

// A producer's first offer on an open request, backed by one of their projects. The quantity is capped by what is still
// to be awarded; there is no stock or unit rule on the backing project.
export const buildStartOpenRequestNegotiationSchema = ({ remaining, today }: Options) =>
  z.object({
    projectId: z.string({ error: "Selecciona el proyecto que respalda la oferta." }).min(1, { error: "Selecciona el proyecto que respalda la oferta." }),
    unitPrice: positiveInt("Precio unitario"),
    quantity: positiveInt("Cantidad").refine((q) => q <= remaining, { error: capMessage(quantityCap(remaining)) }),
    validUntil: isoDate("Ingresa una fecha de vigencia válida.").refine((d) => d > today, {
      error: "La vigencia debe ser posterior a hoy.",
    }),
    deliveryDate: optionalIsoDate("Ingresa una fecha de entrega válida.").refine((d) => d === undefined || d >= today, {
      error: "La fecha de entrega no puede ser anterior a hoy.",
    }),
    deliveryTerms: z.string({ error: "Ingresa las condiciones." }).trim().min(5, { error: "Las condiciones deben tener al menos 5 caracteres." }).max(500, { error: "Máximo 500 caracteres." }),
  });

export type StartOpenRequestNegotiationInput = z.output<ReturnType<typeof buildStartOpenRequestNegotiationSchema>>;

// Re-exported so callers building offers need a single import.
export { buildCounterOfferSchema };
