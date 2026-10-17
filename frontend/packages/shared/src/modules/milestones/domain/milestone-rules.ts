import type {
  EvidenceLog,
  EvidencePayload,
  EvidenceValue,
  MilestoneDetail,
  MilestoneStatus,
  RequirementSpec,
} from "./milestone";

const EVIDENCE_ALLOWED: ReadonlySet<MilestoneStatus> = new Set([
  "ACTIVE",
  "SUPPLIES_PAID",
  "IN_FIELD_EXECUTION",
  "CHANGES_REQUESTED",
]);

const SUBMIT_ALLOWED: ReadonlySet<MilestoneStatus> = new Set(["ACTIVE", "IN_FIELD_EXECUTION", "CHANGES_REQUESTED"]);

// Milestones that already have a favorable dictamen (or are past it): their deadline no longer matters.
const DICTAMEN_DONE: ReadonlySet<string> = new Set(["TECHNICALLY_APPROVED", "LABOR_PAYOUT_PENDING", "COMPLETED_AND_PAID"]);

// D-08: "Plazo vencido" is only a WARNING (the grant is never revoked automatically): the estimated completion date passed
// without a favorable dictamen on a milestone that has started. `today` is an ISO yyyy-mm-dd day.
export const isDeadlineExpired = (milestone: { status: string; dueDate?: string | null }, today: string): boolean =>
  Boolean(milestone.dueDate) && milestone.status !== "LOCKED" && !DICTAMEN_DONE.has(milestone.status) && String(milestone.dueDate) < today;

export interface ChecklistItem {
  requirement: RequirementSpec;
  done: boolean;
}

export const canRecordEvidence = (status: MilestoneStatus): boolean => EVIDENCE_ALLOWED.has(status);

// Latest value per field key wins; logs are folded oldest to newest without mutating the input.
export function currentFieldData(logs: readonly EvidenceLog[]): EvidencePayload {
  const ordered = [...logs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return Object.assign({}, ...ordered.map((l) => l.evidencePayload)) as EvidencePayload;
}

function isSatisfied(req: RequirementSpec, value: EvidenceValue | undefined): boolean {
  switch (req.type) {
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (req.min === undefined || value >= req.min) &&
        (req.max === undefined || value <= req.max)
      );
    case "boolean_system_check":
      return value === true;
    case "photo_array":
      return Array.isArray(value) && value.length >= req.minItems;
  }
}

export const requirementChecklist = (
  requirements: readonly RequirementSpec[],
  data: EvidencePayload,
): ChecklistItem[] => requirements.map((requirement) => ({ requirement, done: isSatisfied(requirement, data[requirement.fieldKey]) }));

export const missingRequirements = (requirements: readonly RequirementSpec[], data: EvidencePayload): string[] =>
  requirementChecklist(requirements, data)
    .filter((i) => !i.done)
    .map((i) => i.requirement.fieldKey);

export const canSubmitFromStatus = (status: MilestoneStatus): boolean => SUBMIT_ALLOWED.has(status);

export const canSubmitForReview = (m: Pick<MilestoneDetail, "status" | "requirements" | "logs">): boolean =>
  canSubmitFromStatus(m.status) && missingRequirements(m.requirements, currentFieldData(m.logs)).length === 0;
