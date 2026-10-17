import { z } from "zod";
import { BoundaryError } from "../domain/errors";
import type { EvidenceLog, MilestoneDetail, MilestoneSummary, RequirementSpec, Review } from "../domain/milestone";
import {
  evidenceLogDtoSchema,
  milestoneDetailDtoSchema,
  milestoneSummaryDtoSchema,
  type EvidenceLogDto,
  type MilestoneSummaryDto,
  type RequirementDto,
  type ReviewDto,
} from "./dto";

// Validate unknown transport data against a DTO schema; a mismatch is a typed boundary error, never a partial entity.
function parseDto<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid ${what}: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

function requirementFromDto(dto: RequirementDto): RequirementSpec {
  switch (dto.type) {
    case "number":
      return { fieldKey: dto.field_key, label: dto.label, type: "number", min: dto.min, max: dto.max };
    case "boolean_system_check":
      return { fieldKey: dto.field_key, label: dto.label, type: "boolean_system_check" };
    case "photo_array":
      return { fieldKey: dto.field_key, label: dto.label, type: "photo_array", minItems: dto.min_items };
  }
}

const logFromDto = (dto: EvidenceLogDto): EvidenceLog => ({
  id: dto.id,
  milestoneId: dto.milestone_id,
  logType: dto.log_type,
  notes: dto.notes,
  evidencePayload: dto.evidence_payload,
  createdAt: dto.created_at,
});

const reviewFromDto = (dto: ReviewDto): Review => ({
  id: dto.id,
  verdict: dto.verdict,
  comment: dto.comment,
  createdAt: dto.created_at,
});

const summaryFromDto = (dto: MilestoneSummaryDto): MilestoneSummary => ({
  id: dto.id,
  projectId: dto.project_id,
  sequenceOrder: dto.sequence_order,
  title: dto.title,
  status: dto.status,
  suppliesBudget: dto.supplies_budget,
  laborBudget: dto.labor_budget,
  suppliesExecuted: dto.supplies_executed,
  laborExecuted: dto.labor_executed,
  currency: dto.currency,
});

export const toMilestoneSummaries = (data: unknown): MilestoneSummary[] =>
  parseDto(z.array(milestoneSummaryDtoSchema), data, "milestone list").map(summaryFromDto);

export function toMilestoneDetail(data: unknown): MilestoneDetail {
  const dto = parseDto(milestoneDetailDtoSchema, data, "milestone");
  return {
    ...summaryFromDto(dto),
    description: dto.description,
    estimatedCompletionDate: dto.estimated_completion_date,
    requirements: dto.required_evidences.map(requirementFromDto),
    logs: dto.evidence_logs.map(logFromDto),
    reviews: dto.reviews.map(reviewFromDto),
  };
}

export const toEvidenceLog = (data: unknown): EvidenceLog => logFromDto(parseDto(evidenceLogDtoSchema, data, "evidence log"));
