import { z } from "zod";

// Transport shape (snake_case). Type and category stay free strings so values added by a newer server pass the boundary.
export const ledgerEntryDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  type: z.string(),
  category: z.string(),
  amount: z.number(),
  currency: z.string(),
  // Buyer deposits carry the negotiation and buyer; investor capital (INVESTOR_CAPITAL) carries investment_id instead.
  negotiation_id: z.string().default(""),
  buyer_id: z.string().default(""),
  investment_id: z.string().optional(),
  created_at: z.string(),
});

export type LedgerEntryDto = z.infer<typeof ledgerEntryDtoSchema>;
