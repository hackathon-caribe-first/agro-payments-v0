import { z } from "zod";
import { FORM_LEVEL_KEY, type FieldErrors } from "../../milestones/domain/errors";
import { DICTAMEN_VERDICTS } from "../domain/review";

export const COMMENTS_MIN_LENGTH = 10;
export const COMMENTS_MAX_LENGTH = 2000;

export const criterionSchema = z.object({
  fieldKey: z.string().min(1),
  label: z.string(),
  passed: z.boolean({ error: "Indica si el criterio se cumple." }),
  observed: z.string().trim().max(200, { error: "Máximo 200 caracteres." }),
  reason: z.string().trim().min(3, { error: "Explica brevemente el resultado del criterio." }).max(400, { error: "Máximo 400 caracteres." }),
});

// Client-side shape of a dictamen. The business rules (approval needs every criterion to pass, an observed dictamen needs
// at least one subsanación) are enforced here and re-enforced by the server.
export const dictamenInputSchema = z
  .object({
    verdict: z.enum(DICTAMEN_VERDICTS, { error: "Elige el dictamen: aprobado u observado." }),
    comments: z
      .string({ error: "Escribe los comentarios del dictamen." })
      .trim()
      .min(COMMENTS_MIN_LENGTH, { error: `Escribe al menos ${COMMENTS_MIN_LENGTH} caracteres de comentarios.` })
      .max(COMMENTS_MAX_LENGTH, { error: `Máximo ${COMMENTS_MAX_LENGTH} caracteres.` }),
    technicalEvaluation: z.array(criterionSchema),
    subsanaciones: z.array(z.string().trim().min(1, { error: "La subsanación no puede estar vacía." }).max(300, { error: "Máximo 300 caracteres." })),
    signatureHash: z.string().regex(/^[0-9a-f]{64}$/, { error: "La firma del dictamen no es válida." }),
  })
  .superRefine((value, ctx) => {
    if (value.verdict === "APPROVED_FAVORABLE") {
      const failing = value.technicalEvaluation.findIndex((c) => !c.passed);
      if (failing >= 0) {
        ctx.addIssue({ code: "custom", path: ["technicalEvaluation", failing, "passed"], message: "No puedes aprobar con criterios sin cumplir." });
      }
    }
    if (value.verdict === "CHANGES_REQUESTED" && value.subsanaciones.length === 0) {
      ctx.addIssue({ code: "custom", path: ["subsanaciones"], message: "Indica al menos una subsanación para el productor." });
    }
  });

export type DictamenInput = z.infer<typeof dictamenInputSchema>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) (out[issue.path.join(".") || FORM_LEVEL_KEY] ??= []).push(issue.message);
  return out;
}
