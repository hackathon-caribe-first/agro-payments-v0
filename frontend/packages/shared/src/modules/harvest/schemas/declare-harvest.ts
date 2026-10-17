import { z } from "zod";
import { intField, optionalText, percentField, photoUrlsField } from "./fields";

// Producer's harvest declaration. `qualityMetrics` is the dynamic JSON payload sent to the backend.
export const declareHarvestSchema = z
  .object({
    harvestedKg: intField("el volumen cosechado", { max: 100_000_000 }),
    askingPricePerKg: intField("el precio de venta por kilo"),
    humidityPct: percentField("la humedad"),
    score: intField("el puntaje de calidad", { min: 0, max: 100 }),
    certification: optionalText(80, "La certificación"),
    notes: optionalText(1000, "Las observaciones"),
    photoUrls: photoUrlsField,
  })
  .strict()
  .transform((v) => ({
    harvestedKg: v.harvestedKg,
    askingPricePerKg: v.askingPricePerKg,
    qualityMetrics: {
      humidity_pct: v.humidityPct,
      score: v.score,
      ...(v.certification ? { certification: v.certification } : {}),
    } as Record<string, string | number>,
    notes: v.notes,
    photoUrls: v.photoUrls,
  }));

export type DeclareHarvestInput = z.output<typeof declareHarvestSchema>;
