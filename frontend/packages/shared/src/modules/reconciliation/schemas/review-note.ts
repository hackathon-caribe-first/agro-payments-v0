import { z } from "zod";

export const REVIEW_NOTE_MAX_LENGTH = 280;

// Note left when an operator marks a reconciliation row as reviewed.
export const reviewNoteSchema = z.object({
  note: z
    .string({ error: "Escribe una nota." })
    .trim()
    .min(3, { error: "Escribe una nota de al menos 3 caracteres." })
    .max(REVIEW_NOTE_MAX_LENGTH, { error: `Máximo ${REVIEW_NOTE_MAX_LENGTH} caracteres.` }),
});

export type ReviewNoteInput = z.infer<typeof reviewNoteSchema>;
