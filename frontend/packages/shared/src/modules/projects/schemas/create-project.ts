import { z } from "zod";
import { MAX_CONTINGENCY_PCT, PRODUCTION_TYPES, isDateWithin, milestoneQuotation } from "../domain/project-draft";

const CONTINGENCY_MESSAGE = `Ingresa un porcentaje entero entre 0 y ${MAX_CONTINGENCY_PCT}.`;

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

// Keys are positional (e.g. `milestones.2.laborBudget`) so the UI can show each error next to its field.
export const createProjectInputSchema = z
  .object({
    title: z.string({ error: "Ingresa el nombre del proyecto." }).trim().min(3, { error: "El nombre debe tener al menos 3 caracteres." }).max(120, { error: "Máximo 120 caracteres." }),
    description: z.string({ error: "Ingresa la descripción del proyecto." }).trim().min(10, { error: "La descripción debe tener al menos 10 caracteres." }).max(2000, { error: "Máximo 2000 caracteres." }),
    productionType: z.enum(PRODUCTION_TYPES, { error: "Selecciona un tipo de producción." }),
    startDate: isoDate("Ingresa una fecha de inicio válida."),
    estimatedEndDate: isoDate("Ingresa una fecha de finalización válida."),
    milestones: z.array(milestoneSchema, { error: "Agrega al menos un hito." }).min(1, { error: "Agrega al menos un hito." }),
    // RF-01: optional here (projects from the transport may lack it); the creation use case requires it for the form and validates it.
    producerWallet: z
      .string({ error: "Ingresa la billetera del productor." })
      .trim()
      .max(300, { error: "Máximo 300 caracteres." })
      .transform((value) => (value === "" ? undefined : value))
      .optional(),
    // RF-21: basis points, a whole percentage between 0 and 20 %.
    contingencyBps: z
      .number({ error: CONTINGENCY_MESSAGE })
      .int({ error: CONTINGENCY_MESSAGE })
      .min(0, { error: CONTINGENCY_MESSAGE })
      .max(MAX_CONTINGENCY_PCT * 100, { error: CONTINGENCY_MESSAGE })
      .refine((bps) => bps % 100 === 0, { error: CONTINGENCY_MESSAGE })
      .optional(),
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
