import { z } from "zod";
import { UNITS } from "../domain/presale";
import { isoDate, positiveInt } from "./fields";

export const buildPublishListingSchema = (today: string) =>
  z.object({
    title: z.string({ error: "Ingresa el título de la preventa." }).trim().min(3, { error: "El título debe tener al menos 3 caracteres." }).max(120, { error: "Máximo 120 caracteres." }),
    summary: z.string({ error: "Ingresa un resumen." }).trim().min(10, { error: "El resumen debe tener al menos 10 caracteres." }).max(1000, { error: "Máximo 1000 caracteres." }),
    expectedQuantity: positiveInt("Cantidad esperada"),
    unit: z.enum(UNITS, { error: "Selecciona una unidad." }),
    referenceUnitPrice: positiveInt("Precio de referencia"),
    estimatedHarvestDate: isoDate("Ingresa una fecha de cosecha válida.").refine((d) => d >= today, {
      error: "La fecha de cosecha no puede ser anterior a hoy.",
    }),
  });

export type PublishListingInput = z.output<ReturnType<typeof buildPublishListingSchema>>;
