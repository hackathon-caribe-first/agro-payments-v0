import { z } from "zod";
import { PRODUCTION_TYPES, isDateWithin, milestoneQuotation } from "../domain/project-draft";

const budget = (label: string) =>
  z
    .number({ error: `${label}: ingresa un valor numérico.` })
    .int({ error: `${label}: ingresa un valor entero en pesos.` })
    .nonnegative({ error: `${label}: no puede ser negativo.` });

const isoDate = (message: string) => z.iso.date({ error: message });

const milestoneSchema = z.object({
  title: z.string({ error: "Ingresa el nombre del hito." }).trim().min(3, { error: "El nombre debe tener al menos 3 caracteres." }).max(120, { error: "Máximo 120 caracteres." }),
  description: z.string({ error: "Ingresa la descripción del hito." }).trim().min(1, { error: "Ingresa la descripción del hito." }).max(1000, { error: "Máximo 1000 caracteres." }),
  estimatedCompletionDate: isoDate("Ingresa una fecha estimada válida."),
  suppliesBudget: budget("Insumos"),
  laborBudget: budget("Mano de obra"),
});

const isPosition = ([lon, lat]: [number, number]) => Math.abs(lon) <= 180 && Math.abs(lat) <= 90;

// RF-01: same rules and messages as the backend's validatePlotPolygon.
export const plotPolygonSchema = z
  .object(
    {
      type: z.literal("Polygon", { error: "El lote debe ser un polígono GeoJSON." }),
      coordinates: z
        .array(z.array(z.tuple([z.number(), z.number()]), { error: "Dibuja el contorno del lote." }), { error: "Dibuja el contorno del lote." })
        .min(1, { error: "Dibuja el contorno del lote." }),
    },
    { error: "El lote debe ser un polígono GeoJSON." },
  )
  .superRefine((polygon, ctx) => {
    for (const ring of polygon.coordinates) {
      const issue = (message: string) => ctx.addIssue({ code: "custom", message });
      if (ring.length < 4 || ring.length > 1000) return issue("El contorno del lote necesita al menos 4 puntos.");
      if (!ring.every(isPosition)) return issue("Cada punto del lote debe tener longitud (±180) y latitud (±90).");
      const [first, last] = [ring[0], ring[ring.length - 1]];
      if (first[0] !== last[0] || first[1] !== last[1]) return issue("El contorno del lote debe cerrar en el punto donde empieza.");
    }
  });

export const producerWalletSchema = z
  .string({ error: "La billetera debe ser una dirección https." })
  .trim()
  .refine((v) => URL.canParse(v) && new URL(v).protocol === "https:", { error: "La billetera debe ser una dirección https." });

// Keys are positional (e.g. `milestones.2.laborBudget`) so the UI can show each error next to its field.
export const createProjectInputSchema = z
  .object({
    title: z.string({ error: "Ingresa el nombre del proyecto." }).trim().min(3, { error: "El nombre debe tener al menos 3 caracteres." }).max(120, { error: "Máximo 120 caracteres." }),
    description: z.string({ error: "Ingresa la descripción del proyecto." }).trim().min(10, { error: "La descripción debe tener al menos 10 caracteres." }).max(2000, { error: "Máximo 2000 caracteres." }),
    productionType: z.enum(PRODUCTION_TYPES, { error: "Selecciona un tipo de producción." }),
    startDate: isoDate("Ingresa una fecha de inicio válida."),
    estimatedEndDate: isoDate("Ingresa una fecha de finalización válida."),
    milestones: z.array(milestoneSchema, { error: "Agrega al menos un hito." }).min(1, { error: "Agrega al menos un hito." }),
    plotPolygon: plotPolygonSchema.optional(),
    producerWalletAddress: producerWalletSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (input.estimatedEndDate < input.startDate) {
      ctx.addIssue({ code: "custom", path: ["estimatedEndDate"], message: "La fecha de finalización debe ser igual o posterior al inicio." });
      return;
    }
    input.milestones.forEach((m, i) => {
      if (!isDateWithin(m.estimatedCompletionDate, input.startDate, input.estimatedEndDate)) {
        ctx.addIssue({
          code: "custom",
          path: ["milestones", i, "estimatedCompletionDate"],
          message: "La fecha debe estar dentro del periodo del proyecto.",
        });
      }
      if (milestoneQuotation(m) <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["milestones", i, "laborBudget"],
          message: "La cotización del hito debe ser mayor a cero.",
        });
      }
    });
  });

export type CreateProjectSchemaInput = z.input<typeof createProjectInputSchema>;
