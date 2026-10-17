import { z } from "zod";

// Transport shapes (snake_case) of the /api contracts routes. Enum-like values stay strings so a newer server degrades, not crashes.
export const purchaseContractDtoSchema = z.object({
  project_id: z.string(),
  price_type: z.string(),
  price_per_unit: z.number().nullable(),
  floor_per_unit: z.number().nullable(),
  ceiling_per_unit: z.number().nullable(),
  price_reference: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  currency: z.string(),
  settles: z.boolean(),
  buyer_name: z.string().nullable(),
  buyer_email: z.string().nullable(),
  buyer_wallet_address: z.string(),
  updated_at: z.string(),
});

export const policyDtoSchema = z.object({
  project_id: z.string(),
  insurer_name: z.string(),
  insurer_wallet_address: z.string(),
  beneficiary: z.string(),
  source: z.string(),
  premium: z.number(),
  subsidy_pct: z.number(),
  net_premium: z.number(),
  threshold_pct: z.number(),
  threshold_yield_kg_per_ha: z.number(),
  deductible_pct: z.number(),
  hectares: z.number(),
  expected_yield_kg_per_ha: z.number(),
  insured_price_per_kg: z.number(),
  sum_insured: z.number(),
  index_trigger: z.number().nullable(),
  index_exit: z.number().nullable(),
  premium_payment: z
    .object({
      id: z.string(),
      amount: z.number(),
      status: z.string(),
      reference: z.string().nullable(),
      outgoing_payment_id: z.string().nullable().default(null),
      requested_at: z.string(),
      completed_at: z.string().nullable(),
    })
    .nullable(),
});

export const claimDtoSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  observed_value: z.number(),
  evidence: z.string(),
  amount: z.number(),
  status: z.string(),
  incoming_payment_url: z.string().nullable(),
  created_at: z.string(),
  confirmed_at: z.string().nullable(),
});

export const contractDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  version: z.number(),
  hash: z.string(),
  body: z.string(),
  status: z.string(),
  parties: z.array(z.object({ role: z.string(), name: z.string(), signed: z.boolean() })),
  signatures: z.array(z.object({ party_role: z.string(), signed_at: z.string() })),
  signable_roles: z.array(z.string()),
  created_at: z.string(),
});

export type PurchaseContractDto = z.infer<typeof purchaseContractDtoSchema>;
export type PolicyDto = z.infer<typeof policyDtoSchema>;
export type ClaimDto = z.infer<typeof claimDtoSchema>;
export type ContractDto = z.infer<typeof contractDtoSchema>;
