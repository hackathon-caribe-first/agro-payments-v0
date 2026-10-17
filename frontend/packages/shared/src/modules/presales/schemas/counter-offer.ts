import { z } from "zod";
import type { OfferCap } from "../domain/presale-rules";
import { optionalIsoDate, positiveInt, isoDate } from "./fields";

const CAP_MESSAGES: Record<OfferCap["reason"], (cap: number) => string> = {
  remaining: (cap) => `Supera la cantidad pendiente por asignar (${cap}).`,
};

export const capMessage = (cap: OfferCap): string => CAP_MESSAGES[cap.reason](cap.cap);

// An offer or counter-offer by either party: the same terms in both directions.
export const buildCounterOfferSchema = ({ cap, today }: { cap: OfferCap; today: string }) =>
  z.object({
    unitPrice: positiveInt("Precio unitario"),
    quantity: positiveInt("Cantidad").refine((q) => q <= cap.cap, { error: capMessage(cap) }),
    validUntil: isoDate("Ingresa una fecha de vigencia válida.").refine((d) => d > today, {
      error: "La vigencia debe ser posterior a hoy.",
    }),
    deliveryDate: optionalIsoDate("Ingresa una fecha de entrega válida.").refine((d) => d === undefined || d >= today, {
      error: "La fecha de entrega no puede ser anterior a hoy.",
    }),
    deliveryTerms: z.string({ error: "Ingresa las condiciones." }).trim().min(5, { error: "Las condiciones deben tener al menos 5 caracteres." }).max(500, { error: "Máximo 500 caracteres." }),
  });

export type CounterOfferInput = z.output<ReturnType<typeof buildCounterOfferSchema>>;
