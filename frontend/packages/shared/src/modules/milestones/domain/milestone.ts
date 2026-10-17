// Domain types for the producer milestone flow. Enum values mirror the PRD exactly.

export const MILESTONE_STATUSES = [
  "LOCKED",
  "ACTIVE",
  "SUPPLIES_ORDERED",
  "SUPPLIES_PAID",
  "IN_FIELD_EXECUTION",
  "SUBMITTED_FOR_REVIEW",
  "CHANGES_REQUESTED",
  "TECHNICALLY_APPROVED",
  "LABOR_PAYOUT_PENDING",
  "COMPLETED_AND_PAID",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const LOG_TYPES = ["PHOTO_EVIDENCE", "SOIL_ANALYSIS", "IOT_READING", "WEATHER_ALERT", "AGRONOMIC_NOTE"] as const;
export type LogType = (typeof LOG_TYPES)[number];

export const REVIEW_VERDICTS = ["SUBMITTED", "CHANGES_REQUESTED", "APPROVED_FAVORABLE", "PAYOUT_EXECUTED"] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export type RequirementSpec =
  | { fieldKey: string; label: string; type: "number"; min?: number; max?: number }
  | { fieldKey: string; label: string; type: "boolean_system_check" }
  | { fieldKey: string; label: string; type: "photo_array"; minItems: number };

export type EvidenceValue = number | boolean | string[];
export type EvidencePayload = Record<string, EvidenceValue>;

export interface EvidenceLog {
  id: string;
  milestoneId: string;
  logType: LogType;
  notes: string;
  evidencePayload: EvidencePayload;
  createdAt: string;
  /** RF-19/RF-35: where the evidence was taken; absent when not reported. */
  location?: EvidenceLocation | null;
  /** RF-19/RF-35: sha256 (hex) per photo URL; absent when not reported. */
  photoHashes?: PhotoHash[];
}

export interface EvidenceLocation {
  latitude: number;
  longitude: number;
}

export interface PhotoHash {
  url: string;
  sha256: string;
}

export interface Review {
  id: string;
  verdict: ReviewVerdict;
  comment: string | null;
  createdAt: string;
}

export interface MilestoneSummary {
  id: string;
  projectId: string;
  sequenceOrder: number;
  title: string;
  status: MilestoneStatus;
  suppliesBudget: number;
  laborBudget: number;
  suppliesExecuted: number;
  laborExecuted: number;
  currency: string;
}

export interface MilestoneDetail extends MilestoneSummary {
  description: string;
  estimatedCompletionDate?: string;
  requirements: RequirementSpec[];
  logs: EvidenceLog[];
  reviews: Review[];
}
