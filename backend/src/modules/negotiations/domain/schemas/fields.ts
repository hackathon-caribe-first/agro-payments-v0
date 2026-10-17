import { z } from "zod";

// Digit strings coming from inputs become numbers; anything else is left for the number check to reject.
const digitsToNumber = (value: unknown) => (typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value);

// Blank optional inputs arrive as "" (or null): treat them as absent.
const blankToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const positiveInt = (label: string) =>
  z.preprocess(
    digitsToNumber,
    z
      .number({ error: `${label}: ingresa un valor numérico.` })
      .int({ error: `${label}: ingresa un valor entero.` })
      .positive({ error: `${label}: debe ser mayor a cero.` }),
  );

export const optionalPositiveInt = (label: string) =>
  z.preprocess(
    (v) => digitsToNumber(blankToUndefined(v)),
    z
      .number({ error: `${label}: ingresa un valor numérico.` })
      .int({ error: `${label}: ingresa un valor entero.` })
      .positive({ error: `${label}: debe ser mayor a cero.` })
      .optional(),
  );

export const isoDate = (message: string) => z.iso.date({ error: message });

export const optionalIsoDate = (message: string) => z.preprocess(blankToUndefined, z.iso.date({ error: message }).optional());
