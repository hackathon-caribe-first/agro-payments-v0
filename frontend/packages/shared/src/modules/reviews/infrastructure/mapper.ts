import { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import { MILESTONE_STATUSES, REVIEW_VERDICTS, type MilestoneStatus, type ReviewVerdict } from "../../milestones/domain/milestone";
import { toMilestoneDetail } from "../../milestones/infrastructure/mapper";
import {
  ACTOR_ROLES,
  NOTIFICATION_ROLES,
  type ActorRole,
  type CriterionEvaluation,
  type Notification,
  type NotificationRole,
  type OutboxEvent,
  type OutboxEventType,
  type PayoutReceipt,
  type QueueItem,
  type ReviewDetail,
  type ReviewEntry,
} from "../domain/review";
import type { DictamenInput } from "../schemas/dictamen";
import {
  notificationDtoSchema,
  outboxEventDtoSchema,
  payoutDtoSchema,
  queueItemDtoSchema,
  reviewDetailDtoSchema,
  reviewEntryDtoSchema,
  type CriterionDto,
  type DictamenRequestDto,
  type NotificationDto,
  type OutboxEventDto,
  type PayoutDto,
  type QueueItemDto,
  type ReviewEntryDto,
} from "./dto";

function parseDto<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid ${what}: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

// Unknown wire values degrade to a safe default instead of failing the whole page.
const toRole = (value: string): ActorRole => (ACTOR_ROLES as readonly string[]).includes(value) ? (value as ActorRole) : "PLATFORM";
const toNotificationRole = (value: string): NotificationRole =>
  (NOTIFICATION_ROLES as readonly string[]).includes(value) ? (value as NotificationRole) : "PRODUCER";
const toVerdict = (value: string | null): ReviewVerdict | null =>
  value !== null && (REVIEW_VERDICTS as readonly string[]).includes(value) ? (value as ReviewVerdict) : null;
const toStatus = (value: string): MilestoneStatus =>
  (MILESTONE_STATUSES as readonly string[]).includes(value) ? (value as MilestoneStatus) : "LOCKED";
const OUTBOX_TYPES: readonly OutboxEventType[] = ["PAY_PRODUCER_LINE", "REVOKE_MILESTONE_GRANT", "REQUEST_NEXT_MILESTONE_GRANT"];
const toOutboxType = (value: string): OutboxEventType =>
  (OUTBOX_TYPES as readonly string[]).includes(value) ? (value as OutboxEventType) : "PAY_PRODUCER_LINE";

const criterionFromDto = (dto: CriterionDto): CriterionEvaluation => ({
  fieldKey: dto.field_key,
  label: dto.label,
  passed: dto.passed,
  observed: dto.observed,
  reason: dto.reason,
});

const entryFromDto = (dto: ReviewEntryDto): ReviewEntry => ({
  id: dto.id,
  milestoneId: dto.milestone_id,
  actor: { id: dto.actor.id, name: dto.actor.name, role: toRole(dto.actor.role) },
  fromStatus: dto.from_status === null ? null : toStatus(dto.from_status),
  toStatus: toStatus(dto.to_status),
  verdict: toVerdict(dto.verdict),
  comments: dto.comments,
  technicalEvaluation: dto.technical_evaluation_json.map(criterionFromDto),
  subsanaciones: dto.subsanaciones,
  evidenceSnapshot: dto.evidence_snapshot_json ? { logIds: dto.evidence_snapshot_json.log_ids, fieldData: dto.evidence_snapshot_json.field_data } : null,
  signatureHash: dto.signature_hash,
  createdAt: dto.created_at,
});

const queueItemFromDto = (dto: QueueItemDto): QueueItem => ({
  milestoneId: dto.milestone_id,
  projectId: dto.project_id,
  projectTitle: dto.project_title,
  sequenceOrder: dto.sequence_order,
  title: dto.title,
  status: dto.status,
  currency: dto.currency,
  suppliesBudget: dto.supplies_budget,
  laborBudget: dto.labor_budget,
  logCount: dto.log_count,
  referenceAt: dto.reference_at,
  lastComment: dto.last_comment,
});

const payoutFromDto = (dto: PayoutDto): PayoutReceipt => ({
  receiptId: dto.receipt_id,
  milestoneId: dto.milestone_id,
  amount: dto.amount,
  currency: dto.currency,
  beneficiaryWallet: dto.beneficiary_wallet,
  status: "completado",
  paidAt: dto.paid_at,
});

const outboxFromDto = (dto: OutboxEventDto): OutboxEvent => ({
  id: dto.id,
  type: toOutboxType(dto.type),
  milestoneId: dto.milestone_id,
  projectId: dto.project_id,
  nextMilestoneId: dto.next_milestone_id,
  amount: dto.amount,
  currency: dto.currency,
  createdAt: dto.created_at,
});

const notificationFromDto = (dto: NotificationDto): Notification => ({
  id: dto.id,
  role: toNotificationRole(dto.role),
  title: dto.title,
  body: dto.body,
  milestoneId: dto.milestone_id,
  href: dto.href,
  createdAt: dto.created_at,
  readAt: dto.read_at,
});

export const toQueue = (data: unknown): QueueItem[] => parseDto(z.array(queueItemDtoSchema), data, "review queue").map(queueItemFromDto);

export function toReviewDetail(data: unknown): ReviewDetail {
  const dto = parseDto(reviewDetailDtoSchema, data, "review detail");
  return {
    milestone: toMilestoneDetail(dto.milestone),
    project: dto.project,
    assignment: { verifierId: dto.assignment.verifier_id, verifierName: dto.assignment.verifier_name, assignedAt: dto.assignment.assigned_at },
    history: dto.history.map(entryFromDto),
    photoMeta: Object.fromEntries(
      Object.entries(dto.photo_meta).map(([url, m]) => [url, { lat: m.lat, lng: m.lng, accuracyMeters: m.accuracy_m, capturedAt: m.captured_at }]),
    ),
    payout: dto.payout ? payoutFromDto(dto.payout) : null,
    canReview: dto.can_review,
  };
}

export const toReviewEntry = (data: unknown): ReviewEntry => entryFromDto(parseDto(reviewEntryDtoSchema, data, "review entry"));
export const toPayoutReceipt = (data: unknown): PayoutReceipt => payoutFromDto(parseDto(payoutDtoSchema, data, "payout receipt"));
export const toOutbox = (data: unknown): OutboxEvent[] => parseDto(z.array(outboxEventDtoSchema), data, "outbox").map(outboxFromDto);
export const toNotifications = (data: unknown): Notification[] =>
  parseDto(z.array(notificationDtoSchema), data, "notifications").map(notificationFromDto);
export const toNotification = (data: unknown): Notification => notificationFromDto(parseDto(notificationDtoSchema, data, "notification"));

export const toDictamenRequestDto = (verifierId: string, input: DictamenInput): DictamenRequestDto => ({
  verifier_id: verifierId,
  verdict: input.verdict,
  comments: input.comments,
  technical_evaluation: input.technicalEvaluation.map((c) => ({
    field_key: c.fieldKey,
    label: c.label,
    passed: c.passed,
    observed: c.observed,
    reason: c.reason,
  })),
  subsanaciones: input.subsanaciones,
  signature_hash: input.signatureHash,
});
