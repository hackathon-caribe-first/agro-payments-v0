import { z } from "zod";
import { intField } from "./fields";

// Purchase order: quantity cannot exceed what the lot still has available (certified weight).
export const buildCreateOrderSchema = (availableKg: number) =>
  z
    .object({
      quantityKg: intField("la cantidad", { max: availableKg }).refine((v) => v <= availableKg, `La cantidad no puede superar ${availableKg} kg disponibles.`),
    })
    .strict();

export type CreateOrderInput = z.output<ReturnType<typeof buildCreateOrderSchema>>;

// Expected order total the buyer saw, so a changed total is never authorized silently.
export const authorizeOrderSchema = z.object({ expectedTotal: intField("el total de la orden") }).strict();

export const dispatchOrderSchema = z
  .object({
    carrier: z.string().trim().min(2, "Ingresa la transportadora.").max(80, "La transportadora no puede superar 80 caracteres."),
    trackingNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{6,30}$/, "La guía debe tener entre 6 y 30 letras, números o guiones."),
    photoUrl: z
      .string()
      .trim()
      .url("Ingresa un enlace válido a la foto del despacho.")
      .refine((v) => /^https?:\/\//.test(v), "Ingresa un enlace válido a la foto del despacho."),
  })
  .strict();

export type DispatchOrderInput = z.output<typeof dispatchOrderSchema>;
