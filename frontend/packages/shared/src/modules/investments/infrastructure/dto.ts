import { z } from "zod";
import { projectDtoSchema } from "../../projects/infrastructure/dto";

// Transport shapes (snake_case). Status stays a free string so values added by a newer server pass the boundary.
export const captureDtoSchema = z.object({
  target_amount: z.number(),
  raised: z.number(),
  currency: z.string(),
  progress_pct: z.number().int(),
  investors_count: z.number().int(),
  by_currency: z.array(z.object({ currency: z.string(), debited: z.string(), received_cop: z.number() })),
});

export const investorProjectDtoSchema = projectDtoSchema.extend({ capture: captureDtoSchema });

export const investmentDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  investor_id: z.string(),
  wallet_address: z.string(),
  status: z.string(),
  failure_reason: z.string().nullable(),
  amount: z.number(),
  currency: z.string(),
  quote: z
    .object({
      id: z.string(),
      debit_amount: z.string(),
      debit_asset_code: z.string(),
      debit_asset_scale: z.number().int(),
      receive_amount: z.number(),
      expires_at: z.string().nullable(),
    })
    .nullable(),
  implied_rate: z.string().nullable(),
  incoming_payment_id: z.string().nullable(),
  outgoing_payment_id: z.string().nullable(),
  created_at: z.string(),
  captured_at: z.string().nullable(),
  consent_redirect_url: z.string().optional(),
});

export type CaptureDto = z.infer<typeof captureDtoSchema>;
export type InvestorProjectDto = z.infer<typeof investorProjectDtoSchema>;
export type InvestmentDto = z.infer<typeof investmentDtoSchema>;
