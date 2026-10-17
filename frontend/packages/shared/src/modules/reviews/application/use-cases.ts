import { BoundaryError, NetworkError, ValidationFailure, err, ok, type Result } from "../../milestones/domain/errors";
import type { ReviewError } from "../domain/errors";
import type { Notification, NotificationRole, OutboxEvent, PayoutReceipt, QueueItem, QueueTab, ReviewActor, ReviewDetail, ReviewEntry } from "../domain/review";
import { canConfirmPayout, canIssueDictamen } from "../domain/review-rules";
import { dictamenInputSchema, toFieldErrors } from "../schemas/dictamen";
import type { ReviewRepository } from "./review-repository";

export type ReviewResult<T> = Result<T, ReviewError>;

export function toReviewError(cause: unknown): ReviewError {
  if (cause instanceof ValidationFailure) return { kind: "validation", fieldErrors: cause.fieldErrors };
  if (cause instanceof BoundaryError) return { kind: "boundary", message: cause.message };
  if (cause instanceof NetworkError) return { kind: "network", message: cause.message };
  return { kind: "network", message: cause instanceof Error ? cause.message : "Unexpected failure" };
}

// Repository failures never escape as exceptions: they become typed errors.
export async function attempt<T>(work: () => Promise<ReviewResult<T>>): Promise<ReviewResult<T>> {
  try {
    return await work();
  } catch (cause) {
    return err(toReviewError(cause));
  }
}

export const listReviewQueue = (repo: ReviewRepository, verifier: ReviewActor, tab: QueueTab) =>
  attempt<QueueItem[]>(async () => ok(await repo.listQueue(verifier.id, tab)));

export const getReviewDetail = (repo: ReviewRepository, verifier: ReviewActor, milestoneId: string) =>
  attempt<ReviewDetail>(async () => {
    const detail = await repo.getDetail(milestoneId, verifier.id);
    if (!detail) return err({ kind: "not_found" });
    // Newest first, like the producer pages.
    return ok({ ...detail, history: [...detail.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  });

// Guards run before the repository is asked to write anything; the server re-enforces them.
export const issueDictamen = (repo: ReviewRepository, verifier: ReviewActor, milestoneId: string, raw: unknown) =>
  attempt<ReviewEntry>(async () => {
    const detail = await repo.getDetail(milestoneId, verifier.id);
    if (!detail) return err({ kind: "not_found" });
    if (!detail.canReview) return err({ kind: "not_assigned" });
    if (!canIssueDictamen(detail.milestone.status)) return err({ kind: "invalid_transition", status: detail.milestone.status });

    const parsed = dictamenInputSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await repo.submitDictamen(milestoneId, verifier.id, parsed.data));
  });

export const confirmProducerPayout = (repo: ReviewRepository, actor: ReviewActor, milestoneId: string) =>
  attempt<PayoutReceipt>(async () => {
    const detail = await repo.getDetail(milestoneId, actor.id);
    if (!detail) return err({ kind: "not_found" });
    if (detail.milestone.status !== "LABOR_PAYOUT_PENDING") return err({ kind: "invalid_transition", status: detail.milestone.status });
    if (!canConfirmPayout(detail.milestone.status, detail.history, detail.assignment.verifierId)) return err({ kind: "payout_blocked" });
    return ok(await repo.confirmPayout(milestoneId, actor.id));
  });

export const listOutbox = (repo: ReviewRepository) => attempt<OutboxEvent[]>(async () => ok(await repo.listOutbox()));

export const listNotifications = (repo: ReviewRepository, role: NotificationRole) =>
  attempt<Notification[]>(async () => {
    const list = await repo.listNotifications(role);
    return ok([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });

export const markNotificationRead = (repo: ReviewRepository, notificationId: string) =>
  attempt<Notification>(async () => {
    const updated = await repo.markNotificationRead(notificationId);
    return updated ? ok(updated) : err({ kind: "not_found" });
  });

export const markAllNotificationsRead = (repo: ReviewRepository, role: NotificationRole) =>
  attempt<null>(async () => {
    await repo.markAllNotificationsRead(role);
    return ok(null);
  });

// Badge helper for any layout: how many notifications are still unread.
export const unreadCount = (list: readonly Notification[]): number => list.filter((n) => n.readAt === null).length;
