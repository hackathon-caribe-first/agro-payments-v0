import { ApiProperty } from "@nestjs/swagger";
import { PROJECT_STATUS, PRODUCTION_TYPE, type ProjectStatus } from "../../application/project";

// /api wire shapes: snake_case and whole pesos, exactly as the web app's zod DTOs (feat/producer-milestones) parse them.

/** PRD project */
export class ProjectResponseDto {
  id: string;
  /** AGR-YYYY-NNN, sequential per year */
  project_code: string;
  title: string;
  production_type: string;
  description: string;
  /** Σ(supplies + labor) of the milestones, whole pesos; the platform fee is on top */
  target_amount: number;
  custody_balance: number;
  total_disbursed: number;
  investor_roi_pct: number;
  platform_fee_pct: number;
  @ApiProperty({ enum: Object.values(PROJECT_STATUS), enumName: "ProjectStatus" })
  current_status: ProjectStatus;
  /** yyyy-mm-dd */
  start_date: string;
  estimated_end_date: string;
  currency: string;
}

/** PRD required_evidences entry; min/max apply to number, min_items to photo_array */
export class RequirementDto {
  field_key: string;
  label: string;
  @ApiProperty({ enum: ["number", "boolean_system_check", "photo_array"] })
  type: "number" | "boolean_system_check" | "photo_array";
  min?: number;
  max?: number;
  min_items?: number;
}

export class RequirementsSchemaDto {
  @ApiProperty({ type: [RequirementDto] })
  required_evidences: RequirementDto[];
}

export class CreateProjectMilestoneRequestDto {
  title: string;
  description: string;
  /** yyyy-mm-dd, within the project period */
  estimated_completion_date: string;
  /** Whole pesos */
  supplies_budget: number;
  /** Whole pesos; must be above zero (it pays the producer line) */
  labor_budget: number;
  /** 1-based; milestones open in this order */
  sequence_order: number;
  requirements_schema: RequirementsSchemaDto;
}

export class CreateProjectRequestDto {
  title: string;
  description: string;
  @ApiProperty({ enum: Object.values(PRODUCTION_TYPE) })
  production_type: string;
  start_date: string;
  estimated_end_date: string;
  @ApiProperty({ type: [CreateProjectMilestoneRequestDto] })
  milestones: CreateProjectMilestoneRequestDto[];
}

/** 400/404/409 body of the /api routes; errors is keyed by field path (e.g. "milestones.2.laborBudget", "_form") */
export class ApiErrorDto {
  error: string;
  @ApiProperty({ type: "object", additionalProperties: { type: "array", items: { type: "string" } } })
  errors: Record<string, string[]>;
}
