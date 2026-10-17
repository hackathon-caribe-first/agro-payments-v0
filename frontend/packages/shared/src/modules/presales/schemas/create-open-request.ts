import { z } from "zod";
import { UNITS } from "../domain/presale";
import { isoDate, optionalPositiveInt, positiveInt } from "./fields";

export const buildCreateOpenRequestSchema = (today: string) =>
  z.object({
    title: z.string({ error: "Ingresa un título." }).trim().min(3, { error: "El título debe tener al menos 3 caracteres." }).max(120, { error: "Máximo 120 caracteres." }),
    productionType: z.string({ error: "Ingresa el tipo de producción." }).trim().min(2, { error: "Ingresa el tipo de producción." }).max(60, { error: "Máximo 60 caracteres." }),
    quantity: positiveInt("Cantidad"),
    unit: z.enum(UNITS, { error: "Selecciona una unidad." }),
    targetUnitPrice: optionalPositiveInt("Precio objetivo"),
    deliveryDate: isoDate("Ingresa una fecha de entrega válida.").refine((d) => d >= today, {
      error: "La fecha de entrega no puede ser anterior a hoy.",
    }),
    deliveryLocation: z.string({ error: "Ingresa el lugar de entrega." }).trim().min(3, { error: "El lugar debe tener al menos 3 caracteres." }).max(120, { error: "Máximo 120 caracteres." }),
    notes: z.string({ error: "Las notas deben ser texto." }).trim().max(500, { error: "Máximo 500 caracteres." }),
  });

export type CreateOpenRequestInput = z.output<ReturnType<typeof buildCreateOpenRequestSchema>>;
