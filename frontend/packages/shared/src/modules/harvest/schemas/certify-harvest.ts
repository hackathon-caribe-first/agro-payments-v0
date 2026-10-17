import { z } from "zod";
import { intField, optionalText, percentField } from "./fields";

// Verifier's opinion. The certified weight cannot exceed what the producer declared.
export const buildCertifyHarvestSchema = (declaredKg: number) =>
  z
    .object({
      certifiedKg: intField("el peso certificado").refine((v) => v <= declaredKg, `El peso certificado no puede superar lo declarado (${declaredKg} kg).`),
      humidityPct: percentField("la humedad verificada"),
      score: intField("el puntaje de calidad", { min: 0, max: 100 }),
      certification: optionalText(80, "La certificación"),
      comments: z.string().trim().min(10, "Escribe un comentario de al menos 10 caracteres.").max(1000, "El comentario no puede superar 1000 caracteres."),
      signed: z.literal("on", { error: "Confirma que firmas el dictamen." }),
    })
    .strict()
    .transform((v) => ({
      certifiedKg: v.certifiedKg,
      certifiedMetrics: {
        humidity_pct: v.humidityPct,
        score: v.score,
        ...(v.certification ? { certification: v.certification } : {}),
      } as Record<string, string | number>,
      comments: v.comments,
    }));

export type CertifyHarvestInput = z.output<ReturnType<typeof buildCertifyHarvestSchema>>;

export const requestCorrectionsSchema = z
  .object({
    comments: z.string().trim().min(10, "Describe qué debe corregir el productor (mínimo 10 caracteres).").max(1000, "El comentario no puede superar 1000 caracteres."),
  })
  .strict();

export type RequestCorrectionsInput = z.output<typeof requestCorrectionsSchema>;
