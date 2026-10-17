import { z } from "zod";

// Form values arrive as strings. Integer fields accept digits only (no decimals, no separators): RNF-10.
export const intField = (label: string, { min = 1, max = 1_000_000_000 }: { min?: number; max?: number } = {}) =>
  z
    .string({ error: `Ingresa ${label}.` })
    .trim()
    .min(1, `Ingresa ${label}.`)
    .regex(/^\d+$/, `${label[0].toUpperCase()}${label.slice(1)} debe ser un número entero, sin puntos ni comas.`)
    .transform(Number)
    .pipe(z.number().min(min, `${label[0].toUpperCase()}${label.slice(1)} debe ser al menos ${min}.`).max(max, `${label[0].toUpperCase()}${label.slice(1)} no puede superar ${max}.`));

// Humidity may carry one decimal ("12,5" or "12.5").
export const percentField = (label: string) =>
  z
    .string({ error: `Ingresa ${label}.` })
    .trim()
    .min(1, `Ingresa ${label}.`)
    .regex(/^\d{1,3}([.,]\d)?$/, `${label[0].toUpperCase()}${label.slice(1)} debe ser un porcentaje con máximo un decimal.`)
    .transform((v) => Number(v.replace(",", ".")))
    .pipe(z.number().min(0).max(100, `${label[0].toUpperCase()}${label.slice(1)} no puede superar 100.`));

export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} no puede superar ${max} caracteres.`)
    .optional()
    .transform((v) => v ?? "");

export const urlLine = z.string().url("Ingresa enlaces válidos que empiecen por https://.").refine((v) => /^https?:\/\//.test(v), "Ingresa enlaces válidos que empiecen por https://.");

// One URL per line (blank lines ignored).
export const photoUrlsField = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )
  .pipe(z.array(urlLine).max(6, "Adjunta máximo 6 fotos."));
