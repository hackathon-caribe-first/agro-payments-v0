import { z } from "zod";
import { LOG_TYPES, MILESTONE_STATUSES, REVIEW_VERDICTS } from "../domain/milestone";

// Transport shapes (snake_case, PRD-shaped). Validated at the boundary, then mapped to domain types.

export const requirementDtoSchema = z.discriminatedUnion("type", [
  z.object({
    field_key: z.string().min(1),
    label: z.string(),
    type: z.literal("number"),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({ field_key: z.string().min(1), label: z.string(), type: z.literal("boolean_system_check") }),
  z.object({
    field_key: z.string().min(1),
    label: z.string(),
    type: z.literal("photo_array"),
    min_items: z.number().int().nonnegative(),
  }),
]);

export const evidenceLogDtoSchema = z.object({
  id: z.string(),
  milestone_id: z.string(),
  log_type: z.enum(LOG_TYPES),
  notes: z.string(),
  evidence_payload: z.record(z.string(), z.union([z.number(), z.boolean(), z.array(z.string())])),
  created_at: z.string(),
});

export const reviewDtoSchema = z.object({
  id: z.string(),
  verdict: z.enum(REVIEW_VERDICTS),
  comment: z.string().nullable(),
  created_at: z.string(),
});

export const milestoneSummaryDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  sequence_order: z.number().int(),
  title: z.string(),
  status: z.enum(MILESTONE_STATUSES),
  supplies_budget: z.number(),
  labor_budget: z.number(),
  supplies_executed: z.number(),
  labor_executed: z.number(),
  currency: z.string(),
});

export const milestoneDetailDtoSchema = milestoneSummaryDtoSchema.extend({
  description: z.string(),
  estimated_completion_date: z.string().optional(),
  required_evidences: z.array(requirementDtoSchema),
  evidence_logs: z.array(evidenceLogDtoSchema),
  reviews: z.array(reviewDtoSchema),
});

export const evidenceLogRequestDtoSchema = z.object({
  log_type: z.enum(LOG_TYPES),
  notes: z.string(),
  evidence_payload: evidenceLogDtoSchema.shape.evidence_payload,
});

export type RequirementDto = z.infer<typeof requirementDtoSchema>;
export type EvidenceLogDto = z.infer<typeof evidenceLogDtoSchema>;
export type ReviewDto = z.infer<typeof reviewDtoSchema>;
export type MilestoneSummaryDto = z.infer<typeof milestoneSummaryDtoSchema>;
export type MilestoneDetailDto = z.infer<typeof milestoneDetailDtoSchema>;
export type EvidenceLogRequestDto = z.infer<typeof evidenceLogRequestDtoSchema>;
