import { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import type { Project } from "../domain/project";
import type { CreateProjectInput } from "../domain/project-draft";
import { withSequence } from "../domain/project-draft";
import { projectDtoSchema, type CreateProjectRequestDto, type ProjectDto } from "./dto";

function parse<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid ${what}: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

const fromDto = (dto: ProjectDto): Project => ({
  id: dto.id,
  projectCode: dto.project_code,
  title: dto.title,
  productionType: dto.production_type,
  description: dto.description,
  targetAmount: dto.target_amount,
  custodyBalance: dto.custody_balance,
  totalDisbursed: dto.total_disbursed,
  investorRoiPct: dto.investor_roi_pct,
  platformFeePct: dto.platform_fee_pct,
  currentStatus: dto.current_status,
  startDate: dto.start_date,
  estimatedEndDate: dto.estimated_end_date,
  currency: dto.currency,
});

export const toProject = (data: unknown): Project => fromDto(parse(projectDtoSchema, data, "project"));
export const toProjects = (data: unknown): Project[] =>
  parse(z.array(projectDtoSchema), data, "project list").map(fromDto);

export const toCreateProjectRequestDto = (input: CreateProjectInput): CreateProjectRequestDto => ({
  title: input.title,
  description: input.description,
  production_type: input.productionType,
  start_date: input.startDate,
  estimated_end_date: input.estimatedEndDate,
  milestones: withSequence(input.milestones).map((m) => ({
    title: m.title,
    description: m.description,
    estimated_completion_date: m.estimatedCompletionDate,
    supplies_budget: m.suppliesBudget,
    labor_budget: m.laborBudget,
    sequence_order: m.sequenceOrder,
    requirements_schema: { required_evidences: [] },
  })),
});
