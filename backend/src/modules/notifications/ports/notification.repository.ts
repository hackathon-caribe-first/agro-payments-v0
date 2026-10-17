import type { Notification } from "../application/notifications";

export type NotificationViewer = { id: string; role: string };

// Append-only RF-37 notices; only read_at changes. Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class NotificationRepository {
  abstract save(notification: Notification): Promise<void>;
  /** Addressed to the viewer or to the viewer's role, newest first. */
  abstract listFor(viewer: NotificationViewer, limit: number): Promise<Notification[]>;
  /** Sets read_at once; null when the notification does not exist or is not addressed to the viewer. */
  abstract markRead(id: string, viewer: NotificationViewer, at: Date): Promise<Notification | null>;
}
