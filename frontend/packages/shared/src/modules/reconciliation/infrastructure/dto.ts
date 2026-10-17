import { z } from "zod";

// Transport shapes (snake_case). Status-like fields stay free strings so values added by a newer server pass the boundary.

export const reviewDtoSchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.string(),
  note: z.string(),
});

export const entryDtoSchema = z.object({
  id: z.string(),
  status: z.string(),
  source: z.string(),
  project_id: z.string().nullable().optional(),
  project_title: z.string(),
  concept: z.string(),
  beneficiary_name: z.string(),
  beneficiary_wallet: z.string(),
  currency: z.string(),
  receipt_id: z.string().nullable(),
  outgoing_payment_id: z.string().nullable(),
  receipt_amount: z.number().nullable(),
  fee: z.number(),
  sent_amount: z.number().nullable(),
  incoming_payment_id: z.string().nullable(),
  incoming_amount: z.number().nullable(),
  occurred_at: z.string(),
  reviews: z.array(reviewDtoSchema).default([]),
});

export const entriesDtoSchema = z.array(entryDtoSchema);

// POST /reconciliation/entries/:id/reviews
export const reviewBodyDtoSchema = z.object({ note: z.string(), actor: z.string().optional() });

export type EntryDto = z.infer<typeof entryDtoSchema>;
