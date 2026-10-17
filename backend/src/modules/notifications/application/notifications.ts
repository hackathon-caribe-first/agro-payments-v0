import { randomUUID } from "node:crypto";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { NotFoundError } from "../../../shared/domain-errors";
import { type DomainEvent, DomainEvents } from "../../../shared/events/domain-events";
import { AssistantInbox } from "../../assistant/ports/assistant-inbox";
import { ProjectRepository } from "../../projects/ports/project.repository";
import { NotificationRepository, type NotificationViewer } from "../ports/notification.repository";
import { type Notice, type NoticeKind, noticesFor } from "./notices";

export type Notification = {
  id: string;
  recipientUserId: string | null;
  recipientRole: string | null;
  kind: NoticeKind;
  title: string;
  body: string;
  projectId: string | null;
  milestoneId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  readAt: Date | null;
};

export const NOTIFICATIONS_LIMIT = 50;

const toNotification = (n: Notice, now: Date): Notification => ({
  id: randomUUID(),
  recipientUserId: "userId" in n.recipient ? n.recipient.userId : null,
  recipientRole: "role" in n.recipient ? n.recipient.role : null,
  kind: n.kind,
  title: n.title,
  body: n.body,
  projectId: n.projectId,
  milestoneId: n.milestoneId,
  payload: n.payload,
  createdAt: now,
  readAt: null,
});

const projectOf = (event: DomainEvent) => ("projectId" in event ? event.projectId : null);

// RF-37: subscribes to the domain events, stores one notice per recipient (append-only) and, for the producer, also says it
// through the assistant. Runs off the use cases' path: a failure here is logged by the bus and never undoes a payment.
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notifications: NotificationRepository,
    private readonly projects: ProjectRepository,
    private readonly inbox: AssistantInbox,
    private readonly events: DomainEvents,
  ) {}

  onModuleInit() {
    this.events.subscribe((event) => this.handle(event));
  }

  async handle(event: DomainEvent) {
    const projectId = projectOf(event);
    const project = projectId ? await this.projects.findById(projectId) : null;
    const now = new Date();
    for (const notice of noticesFor(event, project)) {
      const notification = toNotification(notice, now);
      await this.notifications.save(notification);
      if (!notice.viaAssistant || !notification.recipientUserId) continue;
      await this.inbox
        .deliver(notification.recipientUserId, notification.body)
        .catch((error: unknown) => this.logger.warn(`Notice ${notification.id} not delivered to the assistant: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  list(viewer: NotificationViewer) {
    return this.notifications.listFor(viewer, NOTIFICATIONS_LIMIT);
  }

  async markRead(id: string, viewer: NotificationViewer) {
    const read = await this.notifications.markRead(id, viewer, new Date());
    if (!read) throw new NotFoundError(`Notification ${id} not found`);
    return read;
  }
}
