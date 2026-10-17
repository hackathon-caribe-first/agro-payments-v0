import { z } from "zod";
import { offerCap } from "../domain/presale-rules";
import { buildCounterOfferSchema, capMessage } from "./counter-offer";
import { optionalIsoDate, positiveInt, isoDate } from "./fields";

interface Options {
  remaining: number;
  // Stock of each candidate backing listing, so the quantity limit follows the selected project.
  availableByListing: Readonly<Record<string, number>>;
  today: string;
}

// A producer's first offer on an open request. The quantity limit is the smaller of what is still to be awarded
// and what the chosen listing has available; the message names whichever binds.
export const buildStartOpenRequestNegotiationSchema = ({ remaining, availableByListing, today }: Options) =>
  z
    .object({
      listingId: z.string({ error: "Selecciona el proyecto que respalda la oferta." }).min(1, { error: "Selecciona el proyecto que respalda la oferta." }),
      unitPrice: positiveInt("Precio unitario"),
      quantity: positiveInt("Cantidad"),
      validUntil: isoDate("Ingresa una fecha de vigencia válida.").refine((d) => d > today, {
        error: "La vigencia debe ser posterior a hoy.",
      }),
      deliveryDate: optionalIsoDate("Ingresa una fecha de entrega válida.").refine((d) => d === undefined || d >= today, {
        error: "La fecha de entrega no puede ser anterior a hoy.",
      }),
      deliveryTerms: z.string({ error: "Ingresa las condiciones." }).trim().min(5, { error: "Las condiciones deben tener al menos 5 caracteres." }).max(500, { error: "Máximo 500 caracteres." }),
    })
    .superRefine((input, ctx) => {
      const available = availableByListing[input.listingId];
      if (available === undefined) return;
      const cap = offerCap({ available, remaining });
      if (typeof input.quantity === "number" && input.quantity > cap.cap) {
        ctx.addIssue({ code: "custom", path: ["quantity"], message: capMessage(cap) });
      }
    });

export type StartOpenRequestNegotiationInput = z.output<ReturnType<typeof buildStartOpenRequestNegotiationSchema>>;

// Re-exported so callers building offers need a single import.
export { buildCounterOfferSchema };
