import { z } from "zod";
import { MILESTONE_STATUSES } from "../../milestones/domain/milestone";
import { milestoneDetailDtoSchema } from "../../milestones/infrastructure/dto";

// Transport shapes (snake_case). Enum-like wire values that may grow are plain strings here; the mapper narrows them
// with an explicit UNKNOWN fallback so an unexpected value never breaks a page.

export const actorDtoSchema = z.object({ id: z.string(), name: z.string(), role: z.string() });

export const criterionDtoSchema = z.object({
  field_key: z.string(),
  label: z.string(),
  passed: z.boolean(),
  observed: z.string(),
  reason: z.string(),
});

export const reviewEntryDtoSchema = z.object({
  id: z.string(),
  milestone_id: z.string(),
  actor: actorDtoSchema,
  from_status: z.string().nullable(),
  to_status: z.string(),
  verdict: z.string().nullable(),
  comments: z.string().nullable(),
  technical_evaluation_json: z.array(criterionDtoSchema),
  subsanaciones: z.array(z.string()),
  evidence_snapshot_json: z
    .object({
      log_ids: z.array(z.string()),
      field_data: z.record(z.string(), z.union([z.number(), z.boolean(), z.array(z.string())])),
    })
    .nullable(),
  signature_hash: z.string().nullable(),
  created_at: z.string(),
});

export const queueItemDtoSchema = z.object({
  milestone_id: z.string(),
  project_id: z.string(),
  project_title: z.string(),
  sequence_order: z.number().int(),
  title: z.string(),
  status: z.enum(MILESTONE_STATUSES),
  currency: z.string(),
  supplies_budget: z.number(),
  labor_budget: z.number(),
  log_count: z.number().int(),
  reference_at: z.string().nullable(),
  last_comment: z.string().nullable(),
});

export const payoutDtoSchema = z.object({
  receipt_id: z.string(),
  milestone_id: z.string(),
  amount: z.number(),
  currency: z.string(),
  beneficiary_wallet: z.string(),
  status: z.string(),
  paid_at: z.string(),
});

export const reviewDetailDtoSchema = z.object({
  milestone: milestoneDetailDtoSchema,
  project: z.object({ id: z.string(), code: z.string(), title: z.string() }),
  assignment: z.object({ verifier_id: z.string(), verifier_name: z.string(), assigned_at: z.string() }),
  history: z.array(reviewEntryDtoSchema),
  photo_meta: z.record(
    z.string(),
    z.object({ lat: z.number(), lng: z.number(), accuracy_m: z.number(), captured_at: z.string() }),
  ),
  payout: payoutDtoSchema.nullable(),
  can_review: z.boolean(),
});

export const outboxEventDtoSchema = z.object({
  id: z.string(),
  type: z.string(),
  milestone_id: z.string(),
  project_id: z.string(),
  next_milestone_id: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string(),
  created_at: z.string(),
});

export const notificationDtoSchema = z.object({
  id: z.string(),
  role: z.string(),
  title: z.string(),
  body: z.string(),
  milestone_id: z.string(),
  href: z.string().nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});

// POST /reviews/:milestoneId/dictamen
export const dictamenRequestDtoSchema = z.object({
  verifier_id: z.string(),
  verdict: z.string(),
  comments: z.string(),
  technical_evaluation: z.array(criterionDtoSchema),
  subsanaciones: z.array(z.string()),
  signature_hash: z.string(),
});

// POST /reviews/:milestoneId/confirm-payout
export const confirmPayoutRequestDtoSchema = z.object({ actor_id: z.string().optional() });

export type ReviewEntryDto = z.infer<typeof reviewEntryDtoSchema>;
export type CriterionDto = z.infer<typeof criterionDtoSchema>;
export type QueueItemDto = z.infer<typeof queueItemDtoSchema>;
export type ReviewDetailDto = z.infer<typeof reviewDetailDtoSchema>;
export type PayoutDto = z.infer<typeof payoutDtoSchema>;
export type OutboxEventDto = z.infer<typeof outboxEventDtoSchema>;
export type NotificationDto = z.infer<typeof notificationDtoSchema>;
export type DictamenRequestDto = z.infer<typeof dictamenRequestDtoSchema>;
