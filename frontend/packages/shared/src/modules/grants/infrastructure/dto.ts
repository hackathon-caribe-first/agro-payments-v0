import { z } from "zod";

// Transport shapes (snake_case). Status-like fields stay free strings so values added by a newer server pass the boundary.

export const revocationProofDtoSchema = z.object({
  cap: z.number(),
  spent: z.number(),
  remaining_in_wallet: z.number(),
  delete_response_status: z.number(),
});

export const grantDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  milestone_id: z.string(),
  investor_id: z.string(),
  wallet: z.string(),
  cap_amount: z.number(),
  currency: z.string(),
  spent: z.number(),
  status: z.string(),
  interact_ref: z.string().nullable().optional(),
  hash_state: z.string(),
  token_masked: z.string().nullable().optional(),
  created_at: z.string(),
  approved_at: z.string().nullable().optional(),
  revoked_at: z.string().nullable().optional(),
  revocation_reason: z.string().nullable().optional(),
  revocation: revocationProofDtoSchema.nullable().optional(),
});

export const grantEventDtoSchema = z.object({
  id: z.string(),
  grant_id: z.string(),
  type: z.string(),
  actor: z.string(),
  at: z.string(),
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

export const spendEventDtoSchema = z.object({
  id: z.string(),
  grant_id: z.string(),
  idempotency_key: z.string(),
  line_id: z.string(),
  concept: z.string(),
  beneficiary: z.string(),
  beneficiary_wallet: z.string(),
  received: z.number(),
  fee: z.number(),
  debited: z.number(),
  spent_before: z.number(),
  spent_after: z.number(),
  incoming_payment_id: z.string(),
  outgoing_payment_id: z.string(),
  created_at: z.string(),
});

export const grantProjectDtoSchema = z.object({ id: z.string(), title: z.string(), currency: z.string() });

export const grantMilestoneDtoSchema = z.object({
  id: z.string(),
  sequence_order: z.number().int(),
  title: z.string(),
  status: z.string(),
  budget: z.number(),
  estimated_completion_date: z.string().nullable().optional(),
});

export const grantViewDtoSchema = z.object({
  grant: grantDtoSchema,
  project: grantProjectDtoSchema,
  milestone: grantMilestoneDtoSchema,
});

export const investorGrantsDtoSchema = z.object({
  grants: z.array(grantViewDtoSchema),
  projects: z.array(grantProjectDtoSchema),
});

export const projectGrantsDtoSchema = z.object({
  project: grantProjectDtoSchema,
  milestones: z.array(grantMilestoneDtoSchema),
  grants: z.array(grantDtoSchema),
});

export const grantDetailDtoSchema = grantViewDtoSchema.extend({
  events: z.array(grantEventDtoSchema),
  receipts: z.array(spendEventDtoSchema),
});

export const spendResultDtoSchema = z.object({ receipt: spendEventDtoSchema, replayed: z.boolean() });

export const consentDtoSchema = z.object({ interact_ref: z.string(), hash: z.string() });

// Bodies of the write endpoints.
export const requestGrantBodyDtoSchema = z.object({ milestone_id: z.string(), investor_id: z.string(), wallet: z.string() });
export const consentBodyDtoSchema = z.object({ account_confirmed: z.boolean() });
export const continueBodyDtoSchema = z.object({ interact_ref: z.string(), hash: z.string() });
export const revokeBodyDtoSchema = z.object({ reason: z.string() });
export const spendBodyDtoSchema = z.object({
  line_id: z.string(),
  concept: z.string(),
  beneficiary: z.string(),
  beneficiary_wallet: z.string(),
  received: z.number().int().positive(),
  fee: z.number().int().nonnegative().optional(),
});

// 409 body: the shared rejection shape plus the business code and, for the cap, what is left.
export const conflictBodyDtoSchema = z.object({
  error: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).default({}),
  remaining: z.number().optional(),
});

export type GrantDto = z.infer<typeof grantDtoSchema>;
export type GrantEventDto = z.infer<typeof grantEventDtoSchema>;
export type SpendEventDto = z.infer<typeof spendEventDtoSchema>;
export type GrantProjectDto = z.infer<typeof grantProjectDtoSchema>;
export type GrantMilestoneDto = z.infer<typeof grantMilestoneDtoSchema>;
