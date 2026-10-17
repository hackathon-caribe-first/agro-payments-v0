import { z } from "zod";

// Transport shapes (snake_case). Enumerations arrive as plain strings and the mapper falls back for unknown values.

export const supplierDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  wallet_address: z.string(),
  asset_code: z.string(),
  asset_scale: z.number().int().nonnegative(),
  public_name: z.string(),
  status: z.string(),
  created_at: z.string(),
});
export type SupplierDto = z.infer<typeof supplierDtoSchema>;

export const walletValidationDtoSchema = z.object({
  exists: z.boolean(),
  asset_code: z.string(),
  asset_scale: z.number().int().nonnegative(),
  public_name: z.string(),
});
export type WalletValidationDto = z.infer<typeof walletValidationDtoSchema>;

export const lineDtoSchema = z.object({
  id: z.string(),
  milestone_id: z.string(),
  beneficiary: z.object({
    role: z.string(),
    id: z.string(),
    name: z.string(),
    wallet_address: z.string(),
  }),
  concept: z.string(),
  reference: z.string(),
  amount_mode: z.string(),
  // Minimal units when FIXED; basis points of the milestone cap when PERCENT.
  value: z.number().int().nonnegative(),
  moment: z.string(),
  status: z.string(),
  receipt_id: z.string().nullable().optional(),
  // Detail of the outgoing payment, attached when the line is paid through the grant.
  receipt: z
    .object({
      outgoing_payment_id: z.string(),
      incoming_payment_id: z.string(),
      received: z.number().int(),
      fee: z.number().int(),
      debited: z.number().int(),
    })
    .nullable()
    .optional(),
  created_at: z.string(),
  // RF-11: failed payment attempts, when the engine tries again, and what happened to the line. All optional (older servers omit them).
  attempts: z.number().int().nonnegative().optional(),
  next_attempt_at: z.string().nullable().optional(),
  history: z.array(z.object({ at: z.string(), type: z.string(), message: z.string(), code: z.string().nullable().optional() })).optional(),
});
export type LineDto = z.infer<typeof lineDtoSchema>;

export const milestoneRefDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  sequence_order: z.number().int(),
  title: z.string(),
  cap: z.number().int().nonnegative(),
  currency: z.string(),
  scale: z.number().int().nonnegative(),
  // Project terms that shape the split (all optional: projects created before them keep working).
  contingency_bps: z.number().int().nonnegative().nullable().optional(),
  platform_fee_bps: z.number().int().nonnegative().nullable().optional(),
  producer_wallet: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

export const milestoneLinesDtoSchema = z.object({
  milestone: milestoneRefDtoSchema,
  lines: z.array(lineDtoSchema),
});
export type MilestoneLinesDto = z.infer<typeof milestoneLinesDtoSchema>;

export const projectLinesDtoSchema = z.object({
  project: z.object({ id: z.string(), title: z.string(), project_code: z.string() }),
  milestones: z.array(milestoneLinesDtoSchema),
});
export type ProjectLinesDto = z.infer<typeof projectLinesDtoSchema>;

// ---- request bodies (also parsed by the mock) ----

export const createSupplierBodySchema = z.object({
  name: z.string(),
  category: z.string(),
  wallet_address: z.string(),
});

export const lineBodySchema = z.object({
  beneficiary_id: z.string(),
  concept: z.string(),
  reference: z.string(),
  amount_mode: z.string(),
  value: z.number().int(),
  moment: z.string(),
});
export type LineBodyDto = z.infer<typeof lineBodySchema>;

export const createLineBodySchema = lineBodySchema.extend({ milestone_id: z.string() });

// Body of POST /milestone-lines/:id/attempt: the engine reports that an attempt to pay the line did not go through (RF-11).
export const attemptBodySchema = z.object({
  // Network or 5xx failures are retried automatically; business errors (cap exceeded, revoked grant) never are.
  retryable: z.boolean(),
  code: z.string(),
  message: z.string(),
  manual: z.boolean().optional(),
});
export type AttemptBodyDto = z.infer<typeof attemptBodySchema>;

// ---- the payments received by one supplier (GET /supplier/payments?supplier_id=) ----

export const supplierPaymentDtoSchema = z.object({
  line: lineDtoSchema,
  milestone: z.object({ id: z.string(), title: z.string(), sequence_order: z.number().int(), currency: z.string(), scale: z.number().int().nonnegative() }),
  project: z.object({ id: z.string(), title: z.string(), project_code: z.string() }),
});
export type SupplierPaymentDto = z.infer<typeof supplierPaymentDtoSchema>;
