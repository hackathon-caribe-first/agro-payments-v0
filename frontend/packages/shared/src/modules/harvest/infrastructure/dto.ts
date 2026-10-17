import { z } from "zod";

// Transport shapes (snake_case). Enum-like fields are plain strings: the mapper falls back to UNKNOWN values.
const metricsDto = z.record(z.string(), z.union([z.string(), z.number()]));

export const certificationDtoSchema = z.object({
  verifier_name: z.string(),
  comments: z.string(),
  signature_hash: z.string(),
  certified_at: z.string(),
});

export const harvestBatchDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  project_title: z.string(),
  production_type: z.string(),
  producer_id: z.string(),
  producer_name: z.string(),
  status: z.string(),
  declared_kg: z.number().int(),
  certified_kg: z.number().int().nullable(),
  asking_price_per_kg: z.number().int(),
  available_kg: z.number().int(),
  has_open_order: z.boolean(),
  currency: z.string(),
  quality_metrics: metricsDto,
  certified_metrics: metricsDto.nullable(),
  notes: z.string(),
  photo_urls: z.array(z.string()),
  declared_at: z.string(),
  correction_notes: z.string().nullable(),
  certification: certificationDtoSchema.nullable(),
  investor_capital: z.number().int(),
  investor_yield_pct: z.number(),
  capital_outstanding: z.number().int(),
  yield_outstanding: z.number().int(),
});
export type HarvestBatchDto = z.infer<typeof harvestBatchDtoSchema>;

export const orderDtoSchema = z.object({
  id: z.string(),
  batch_id: z.string(),
  project_id: z.string(),
  project_title: z.string(),
  production_type: z.string(),
  buyer_id: z.string(),
  buyer_name: z.string(),
  producer_id: z.string(),
  producer_name: z.string(),
  quantity_kg: z.number().int(),
  unit_price: z.number().int(),
  total: z.number().int(),
  currency: z.string(),
  status: z.string(),
  grant: z.object({
    state: z.string(),
    cap: z.number().int(),
    approved_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
    revocation_proof: z.string().nullable(),
  }),
  dispatch: z
    .object({ tracking_number: z.string(), carrier: z.string(), photo_url: z.string(), dispatched_at: z.string() })
    .nullable(),
  received_at: z.string().nullable(),
  created_at: z.string(),
  events: z.array(z.object({ status: z.string(), at: z.string() })),
  capital_due: z.number().int(),
  yield_due: z.number().int(),
  platform_fee_bp: z.number().int(),
});
export type OrderDto = z.infer<typeof orderDtoSchema>;

export const settlementDtoSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  project_id: z.string(),
  project_title: z.string(),
  buyer_name: z.string(),
  currency: z.string(),
  total: z.number().int(),
  platform_fee_bp: z.number().int(),
  capital_due: z.number().int(),
  yield_due: z.number().int(),
  status: z.string(),
  loss: z.boolean(),
  shortfall: z.number().int(),
  lines: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      beneficiary_name: z.string(),
      amount: z.number().int(),
      state: z.string(),
      incoming_payment_id: z.string().nullable(),
      outgoing_payment_id: z.string().nullable(),
      receipt_id: z.string().nullable(),
      executed_at: z.string().nullable(),
    }),
  ),
  revocation: z
    .object({ revoked_at: z.string(), response_status: z.number().int(), cap: z.number().int(), spent: z.number().int(), remaining: z.number().int() })
    .nullable(),
  created_at: z.string(),
});
export type SettlementDto = z.infer<typeof settlementDtoSchema>;

export const orderDetailDtoSchema = z.object({ order: orderDtoSchema, settlement: settlementDtoSchema.nullable() });
export type OrderDetailDto = z.infer<typeof orderDetailDtoSchema>;

export const declarationContextDtoSchema = z.object({
  project: z.object({ id: z.string(), title: z.string(), production_type: z.string(), current_status: z.string(), currency: z.string() }),
  milestones: z.array(z.object({ id: z.string(), title: z.string(), sequence_order: z.number().int(), status: z.string() })),
  batches: z.array(harvestBatchDtoSchema),
});
export type DeclarationContextDto = z.infer<typeof declarationContextDtoSchema>;

// Request bodies (mock validates them like a backend would).
export const declareBodyDtoSchema = z.object({
  harvested_kg: z.number().int().positive(),
  asking_price_per_kg: z.number().int().positive(),
  quality_metrics: metricsDto,
  notes: z.string(),
  photo_urls: z.array(z.string()),
});
export const certifyBodyDtoSchema = z.object({
  certified_kg: z.number().int().positive(),
  certified_metrics: metricsDto,
  comments: z.string(),
});
export const commentsBodyDtoSchema = z.object({ comments: z.string() });
export const createOrderBodyDtoSchema = z.object({ batch_id: z.string(), buyer_id: z.string(), quantity_kg: z.number().int().positive() });
export const authorizeBodyDtoSchema = z.object({ buyer_id: z.string(), expected_total: z.number().int() });
export const buyerBodyDtoSchema = z.object({ buyer_id: z.string() });
export const dispatchBodyDtoSchema = z.object({ carrier: z.string(), tracking_number: z.string(), photo_url: z.string() });
