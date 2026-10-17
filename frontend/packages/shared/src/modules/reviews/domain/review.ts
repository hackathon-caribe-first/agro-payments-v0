// Domain types for the technical verification flow (PRD Fase 3 · Sub-etapa C). Enum values mirror the PRD.
import type { EvidenceLog, MilestoneDetail, MilestoneStatus, ReviewVerdict } from "../../milestones/domain/milestone";

export const DICTAMEN_VERDICTS = ["APPROVED_FAVORABLE", "CHANGES_REQUESTED"] as const;
export type DictamenVerdict = (typeof DICTAMEN_VERDICTS)[number];

export const ACTOR_ROLES = ["PRODUCER", "VERIFIER", "INVESTOR", "PLATFORM"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export const NOTIFICATION_ROLES = ["PRODUCER", "VERIFIER", "INVESTOR"] as const;
export type NotificationRole = (typeof NOTIFICATION_ROLES)[number];

export const QUEUE_TABS = ["pending", "changes", "decided"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

export interface ReviewActor {
  id: string;
  name: string;
  role: ActorRole;
}

// There is no authentication yet: the verifier is a fixed profile assigned to the local projects.
export const VERIFIER_PROFILE: ReviewActor = { id: "verifier-camila-rojas", name: "Camila Rojas (verificadora)", role: "VERIFIER" };

export interface CriterionEvaluation {
  fieldKey: string;
  label: string;
  passed: boolean;
  // What the verifier observed (value found, count of photos...) and why it passes or not.
  observed: string;
  reason: string;
}

export interface EvidenceSnapshot {
  logIds: string[];
  fieldData: Record<string, number | boolean | string[]>;
}

// One immutable audit entry (RNF-06). `verdict` is null for system transitions that carry no dictamen.
export interface ReviewEntry {
  id: string;
  milestoneId: string;
  actor: ReviewActor;
  fromStatus: MilestoneStatus | null;
  toStatus: MilestoneStatus;
  verdict: ReviewVerdict | null;
  comments: string | null;
  technicalEvaluation: CriterionEvaluation[];
  subsanaciones: string[];
  evidenceSnapshot: EvidenceSnapshot | null;
  signatureHash: string | null;
  createdAt: string;
}

export interface PhotoMeta {
  lat: number;
  lng: number;
  accuracyMeters: number;
  capturedAt: string;
}

export interface Assignment {
  verifierId: string;
  verifierName: string;
  assignedAt: string;
}

export interface PayoutReceipt {
  receiptId: string;
  milestoneId: string;
  amount: number;
  currency: string;
  beneficiaryWallet: string;
  status: "completado";
  paidAt: string;
}

export interface ReviewProject {
  id: string;
  code: string;
  title: string;
}

export interface QueueItem {
  milestoneId: string;
  projectId: string;
  projectTitle: string;
  sequenceOrder: number;
  title: string;
  status: MilestoneStatus;
  currency: string;
  suppliesBudget: number;
  laborBudget: number;
  logCount: number;
  // Latest review timestamp relevant to the tab: submission for pending, decision otherwise.
  referenceAt: string | null;
  lastComment: string | null;
}

export interface ReviewDetail {
  milestone: MilestoneDetail;
  project: ReviewProject;
  assignment: Assignment;
  history: ReviewEntry[];
  photoMeta: Record<string, PhotoMeta>;
  payout: PayoutReceipt | null;
  // Whether the requesting verifier is the one assigned to the project (PRD request #10).
  canReview: boolean;
}

export type OutboxEventType = "PAY_PRODUCER_LINE" | "REVOKE_MILESTONE_GRANT" | "REQUEST_NEXT_MILESTONE_GRANT";

export interface OutboxEvent {
  id: string;
  type: OutboxEventType;
  milestoneId: string;
  projectId: string;
  nextMilestoneId: string | null;
  amount: number | null;
  currency: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  role: NotificationRole;
  title: string;
  body: string;
  milestoneId: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
}

export type { EvidenceLog };
