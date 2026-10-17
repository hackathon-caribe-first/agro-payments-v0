import { z } from "zod";
import { positiveInt } from "./fields";

// Accept/reject carry only the revision (hidden input); a string is coerced to a positive integer.
export const revisionSchema = z.coerce.number({ error: "Revisión inválida." }).int().positive({ error: "Revisión inválida." });

// The total of the project quotation the buyer saw when accepting a PROJECT offer. The server compares it to its own.
export const expectedTotalSchema = z.object({ expectedTotal: positiveInt("Total del depósito") });

// Executing a pending deposit: the same total check.
export const depositSchema = z.object({ expectedTotal: positiveInt("Total del depósito") });
