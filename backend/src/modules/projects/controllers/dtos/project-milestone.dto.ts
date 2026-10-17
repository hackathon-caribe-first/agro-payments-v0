import { ApiProperty, type ApiPropertyOptions } from "@nestjs/swagger";
import { LOG_TYPE, type EvidencePayload, type LogType } from "../../../milestones/application/milestone";
import { PROGRESS_STATUS, type ProgressStatus } from "../../../milestones/application/milestone-progress";
import { RequirementDto } from "./project.dto";

const EVIDENCE_PAYLOAD_SCHEMA: ApiPropertyOptions = {
  type: "object",
  additionalProperties: { oneOf: [{ type: "number" }, { type: "boolean" }, { type: "array", items: { type: "string" } }] },
};

export const API_REVIEW_VERDICT = ["SUBMITTED", "CHANGES_REQUESTED", "APPROVED_FAVORABLE", "PAYOUT_EXECUTED"] as const;
export type ApiReviewVerdict = (typeof API_REVIEW_VERDICT)[number];

/** PRD milestone, list view; amounts in whole pesos */
export class MilestoneSummaryResponseDto {
  id: string;
  /** Empty for the legacy demo milestones, which belong to no project */
  project_id: string;
  /** 0 for the legacy demo milestones */
  sequence_order: number;
  title: string;
  /** Derived from the milestone, its lines and the project order (see milestone-progress.ts) */
  @ApiProperty({ enum: Object.values(PROGRESS_STATUS), enumName: "MilestoneProgressStatus" })
  status: ProgressStatus;
  /** Σ proveedor lines */
  supplies_budget: number;
  /** Σ productor + trabajadores lines */
  labor_budget: number;
  supplies_executed: number;
  labor_executed: number;
  currency: string;
}

export class EvidenceLocationDto {
  latitude: number;
  longitude: number;
}

export class PhotoHashDto {
  url: string;
  sha256: string;
}

export class EvidenceLogResponseDto {
  id: string;
  milestone_id: string;
  @ApiProperty({ enum: Object.values(LOG_TYPE), enumName: "EvidenceLogType" })
  log_type: LogType;
  notes: string;
  @ApiProperty(EVIDENCE_PAYLOAD_SCHEMA)
  evidence_payload: EvidencePayload;
  created_at: string;
  /** RF-19/RF-35: where the evidence was taken; present only when reported */
  location?: EvidenceLocationDto | null;
  /** RF-19/RF-35: sha256 (hex) per photo URL; present only when reported */
  @ApiProperty({ required: false, type: () => [PhotoHashDto] })
  photo_hashes?: PhotoHashDto[];
}

export class MilestoneReviewResponseDto {
  id: string;
  @ApiProperty({ enum: API_REVIEW_VERDICT, enumName: "MilestoneReviewVerdict" })
  verdict: ApiReviewVerdict;
  @ApiProperty({ type: String, nullable: true })
  comment: string | null;
  created_at: string;
}

export class MilestoneDetailResponseDto extends MilestoneSummaryResponseDto {
  description: string;
  /** yyyy-mm-dd; omitted when unknown (legacy demo milestones) */
  estimated_completion_date?: string;
  @ApiProperty({ type: [RequirementDto] })
  required_evidences: RequirementDto[];
  @ApiProperty({ type: [EvidenceLogResponseDto] })
  evidence_logs: EvidenceLogResponseDto[];
  @ApiProperty({ type: [MilestoneReviewResponseDto] })
  reviews: MilestoneReviewResponseDto[];
}

export class EvidenceLogRequestDto {
  @ApiProperty({ enum: Object.values(LOG_TYPE), enumName: "EvidenceLogType" })
  log_type: LogType;
  /** At most 1000 characters */
  notes: string;
  /** Exactly the milestone's required_evidences keys: numbers within min/max, booleans, http(s) photo URLs */
  @ApiProperty(EVIDENCE_PAYLOAD_SCHEMA)
  evidence_payload: EvidencePayload;
  /** RF-19/RF-35, optional: latitude ±90, longitude ±180 */
  location?: EvidenceLocationDto;
  /** RF-19/RF-35, optional: one sha256 hex per photo URL of evidence_payload */
  @ApiProperty({ required: false, type: () => [PhotoHashDto] })
  photo_hashes?: PhotoHashDto[];
}
