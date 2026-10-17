import type { Notification, NotificationRole, OutboxEvent, PayoutReceipt, QueueItem, QueueTab, ReviewDetail, ReviewEntry } from "../domain/review";
import type { DictamenInput } from "../schemas/dictamen";

// Port of the verification flow. Rejections (400/409) surface as ValidationFailure from the infrastructure.
export interface ReviewRepository {
  listQueue(verifierId: string, tab: QueueTab): Promise<QueueItem[]>;
  getDetail(milestoneId: string, verifierId: string): Promise<ReviewDetail | null>;
  submitDictamen(milestoneId: string, verifierId: string, input: DictamenInput): Promise<ReviewEntry>;
  confirmPayout(milestoneId: string, actorId: string): Promise<PayoutReceipt>;
  listOutbox(): Promise<OutboxEvent[]>;
  listNotifications(role: NotificationRole): Promise<Notification[]>;
  markNotificationRead(notificationId: string): Promise<Notification | null>;
  markAllNotificationsRead(role: NotificationRole): Promise<void>;
}
