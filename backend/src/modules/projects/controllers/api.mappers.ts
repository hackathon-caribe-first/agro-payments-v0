// Domain → /api wire shapes. The only place minor units become whole pesos and verdicts become PRD enums.
import { type EvidenceLog, LINE_KIND, LINE_STATUS, type Line, type Requirement, REQUIREMENT_TYPE, type ReviewEntry, type ReviewVerdict } from "../../milestones/application/milestone";
import { minorToPesos, type Project } from "../application/project";
import type { MilestoneView } from "../application/project-queries";
import type { ProjectResponseDto, RequirementDto } from "./dtos/project.dto";
import type {
  ApiReviewVerdict,
  EvidenceLogResponseDto,
  MilestoneDetailResponseDto,
  MilestoneReviewResponseDto,
  MilestoneSummaryResponseDto,
} from "./dtos/project-milestone.dto";

const VERDICTS: Record<ReviewVerdict, ApiReviewVerdict> = {
  submitted: "SUBMITTED",
  observado: "CHANGES_REQUESTED",
  approved: "APPROVED_FAVORABLE",
  payout_executed: "PAYOUT_EXECUTED",
};

export const toProjectResponse = (p: Project): ProjectResponseDto => ({
  id: p.id,
  project_code: p.projectCode,
  title: p.title,
  production_type: p.productionType,
  description: p.description,
  target_amount: minorToPesos(p.targetAmount, p.assetScale),
  custody_balance: minorToPesos(p.custodyBalance, p.assetScale),
  total_disbursed: minorToPesos(p.totalDisbursed, p.assetScale),
  investor_roi_pct: p.investorRoiPct,
  platform_fee_pct: p.platformFeePct,
  current_status: p.currentStatus,
  start_date: p.startDate,
  estimated_end_date: p.estimatedEndDate,
  currency: p.currency,
});

const isSupply = (l: Line) => l.kind === LINE_KIND.PROVEEDOR;
const isLabor = (l: Line) => l.kind === LINE_KIND.PRODUCTOR || l.kind === LINE_KIND.TRABAJADORES;
const sum = (lines: Line[]) => lines.reduce((total, l) => total + l.amount, 0);
const settled = (lines: Line[]) => lines.filter((l) => l.status === LINE_STATUS.COMPLETADO);

export function toMilestoneSummaryResponse({ milestone: m, status }: MilestoneView): MilestoneSummaryResponseDto {
  const pesos = (minor: number) => minorToPesos(minor, m.assetScale);
  const supplies = m.lines.filter(isSupply);
  const labor = m.lines.filter(isLabor);
  return {
    id: m.id,
    project_id: m.projectId ?? "",
    sequence_order: m.sequenceOrder ?? 0,
    title: m.title,
    status,
    supplies_budget: pesos(sum(supplies)),
    labor_budget: pesos(sum(labor)),
    supplies_executed: pesos(sum(settled(supplies))),
    labor_executed: pesos(sum(settled(labor))),
    currency: m.currency,
  };
}

function toRequirementDto(r: Requirement): RequirementDto {
  switch (r.type) {
    case REQUIREMENT_TYPE.NUMBER:
      return { field_key: r.fieldKey, label: r.label, type: r.type, ...(r.min !== undefined && { min: r.min }), ...(r.max !== undefined && { max: r.max }) };
    case REQUIREMENT_TYPE.BOOLEAN_SYSTEM_CHECK:
      return { field_key: r.fieldKey, label: r.label, type: r.type };
    case REQUIREMENT_TYPE.PHOTO_ARRAY:
      return { field_key: r.fieldKey, label: r.label, type: r.type, min_items: r.minItems };
  }
}

export const toEvidenceLogResponse = (milestoneId: string, l: EvidenceLog): EvidenceLogResponseDto => ({
  id: l.id,
  milestone_id: milestoneId,
  log_type: l.logType,
  notes: l.notes,
  evidence_payload: l.evidencePayload,
  created_at: l.createdAt.toISOString(),
});

const toReviewDto = (r: ReviewEntry): MilestoneReviewResponseDto => ({
  id: r.id,
  verdict: VERDICTS[r.verdict],
  comment: r.comment,
  created_at: r.createdAt.toISOString(),
});

export function toMilestoneDetailResponse(view: MilestoneView): MilestoneDetailResponseDto {
  const m = view.milestone;
  return {
    ...toMilestoneSummaryResponse(view),
    description: m.description,
    // Optional, not nullable, on the wire.
    ...(m.estimatedCompletionDate !== null && { estimated_completion_date: m.estimatedCompletionDate }),
    required_evidences: m.requirements.map(toRequirementDto),
    evidence_logs: m.evidenceLogs.map((l) => toEvidenceLogResponse(m.id, l)),
    reviews: m.reviews.map(toReviewDto),
  };
}
