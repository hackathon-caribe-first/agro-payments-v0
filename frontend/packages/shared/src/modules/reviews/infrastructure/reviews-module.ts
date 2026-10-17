import {
  confirmProducerPayout,
  getReviewDetail,
  issueDictamen,
  listNotifications,
  listOutbox,
  listReviewQueue,
  markAllNotificationsRead,
  markNotificationRead,
} from "../application/use-cases";
import { VERIFIER_PROFILE, type NotificationRole, type QueueTab, type ReviewActor } from "../domain/review";
import { HttpReviewRepository } from "./http-review-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
  // The verifier this module acts as. There is no authentication yet: a fixed profile.
  verifier?: ReviewActor;
}

const DEFAULT_BASE_URL = "/api";

// Binds every review use case to one repository over the given transport.
export function createReviewsModule({ fetchFn, baseUrl = DEFAULT_BASE_URL, verifier = VERIFIER_PROFILE }: Options) {
  const repo = new HttpReviewRepository({ baseUrl, fetchFn });
  return {
    verifier,
    listQueue: (tab: QueueTab) => listReviewQueue(repo, verifier, tab),
    getDetail: (milestoneId: string) => getReviewDetail(repo, verifier, milestoneId),
    issueDictamen: (milestoneId: string, raw: unknown) => issueDictamen(repo, verifier, milestoneId, raw),
    confirmPayout: (milestoneId: string) => confirmProducerPayout(repo, verifier, milestoneId),
    listOutbox: () => listOutbox(repo),
    listNotifications: (role: NotificationRole) => listNotifications(repo, role),
    markNotificationRead: (notificationId: string) => markNotificationRead(repo, notificationId),
    markAllNotificationsRead: (role: NotificationRole) => markAllNotificationsRead(repo, role),
  };
}

export type ReviewsModule = ReturnType<typeof createReviewsModule>;
