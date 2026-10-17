import { z } from "zod";

// Transport shape (snake_case). The status stays a free string so values added by a newer server pass the boundary.
export const paymentAuthorizationDtoSchema = z.object({
  id: z.string(),
  negotiation_id: z.string(),
  project_id: z.string(),
  buyer_id: z.string(),
  cap: z.number(),
  spent: z.number(),
  currency: z.string(),
  status: z.string(),
  created_at: z.string(),
  revoked_at: z.string().nullable().optional(),
});

export type PaymentAuthorizationDto = z.infer<typeof paymentAuthorizationDtoSchema>;
