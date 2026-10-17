import { z } from "zod";

// Transport shape (snake_case). Type and category stay free strings so values added by a newer server pass the boundary.
export const ledgerEntryDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  type: z.string(),
  category: z.string(),
  amount: z.number(),
  currency: z.string(),
  negotiation_id: z.string(),
  buyer_id: z.string(),
  created_at: z.string(),
});

export type LedgerEntryDto = z.infer<typeof ledgerEntryDtoSchema>;
