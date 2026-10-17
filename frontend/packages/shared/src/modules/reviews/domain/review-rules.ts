import type { EvidencePayload, MilestoneStatus, RequirementSpec } from "../../milestones/domain/milestone";
import type { CriterionEvaluation, DictamenVerdict, ReviewActor, ReviewEntry } from "./review";

export const canIssueDictamen = (status: MilestoneStatus): boolean => status === "SUBMITTED_FOR_REVIEW";

// Statuses that count as "already decided by the verifier" for the queue.
export const DECIDED_STATUSES: readonly MilestoneStatus[] = ["TECHNICALLY_APPROVED", "LABOR_PAYOUT_PENDING", "COMPLETED_AND_PAID"];

// Final status of a dictamen. An approval passes through TECHNICALLY_APPROVED (recorded as its own audit entry) and lands
// on LABOR_PAYOUT_PENDING when the milestone has a labor budget, or directly on COMPLETED_AND_PAID when it has none.
export function statusAfterDictamen(verdict: DictamenVerdict, laborBudget: number): MilestoneStatus {
  if (verdict === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  return laborBudget > 0 ? "LABOR_PAYOUT_PENDING" : "COMPLETED_AND_PAID";
}

// PRD invariant: the producer line is paid only with an APPROVED_FAVORABLE entry signed by the assigned verifier.
export const hasSignedApproval = (history: readonly ReviewEntry[], assignedVerifierId: string): boolean =>
  history.some(
    (e) => e.verdict === "APPROVED_FAVORABLE" && e.actor.role === "VERIFIER" && e.actor.id === assignedVerifierId && Boolean(e.signatureHash),
  );

export const canConfirmPayout = (status: MilestoneStatus, history: readonly ReviewEntry[], assignedVerifierId: string): boolean =>
  status === "LABOR_PAYOUT_PENDING" && hasSignedApproval(history, assignedVerifierId);

export const isAssigned = (actor: ReviewActor, assignedVerifierId: string): boolean =>
  actor.role === "VERIFIER" && actor.id === assignedVerifierId;

const formatValue = (value: unknown): string => {
  if (value === undefined) return "Sin dato";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return `${value.length} foto${value.length === 1 ? "" : "s"}`;
  return String(value);
};

// Draft technical evaluation: one criterion per requirement, pre-filled from the latest evidence. The verifier may override
// `passed` and `reason` before signing.
export function draftEvaluation(requirements: readonly RequirementSpec[], data: EvidencePayload): CriterionEvaluation[] {
  return requirements.map((req) => {
    const value = data[req.fieldKey];
    const observed = formatValue(value);
    switch (req.type) {
      case "number": {
        const inRange =
          typeof value === "number" && (req.min === undefined || value >= req.min) && (req.max === undefined || value <= req.max);
        const range = [req.min !== undefined ? `mínimo ${req.min}` : null, req.max !== undefined ? `máximo ${req.max}` : null].filter(Boolean).join(", ");
        return {
          fieldKey: req.fieldKey,
          label: req.label,
          passed: inRange,
          observed,
          reason: inRange ? `Dentro del rango exigido${range ? ` (${range})` : ""}.` : `Fuera del rango exigido${range ? ` (${range})` : ""} o sin dato.`,
        };
      }
      case "boolean_system_check":
        return {
          fieldKey: req.fieldKey,
          label: req.label,
          passed: value === true,
          observed,
          reason: value === true ? "Verificación del sistema cumplida." : "La verificación del sistema no se cumple.",
        };
      case "photo_array": {
        const count = Array.isArray(value) ? value.length : 0;
        return {
          fieldKey: req.fieldKey,
          label: req.label,
          passed: count >= req.minItems,
          observed,
          reason: count >= req.minItems ? `Cumple el mínimo de ${req.minItems} fotos.` : `Se exigen al menos ${req.minItems} fotos.`,
        };
      }
    }
  });
}
