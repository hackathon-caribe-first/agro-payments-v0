import type { DataSource } from "typeorm";
import type { Notification } from "../application/notifications";
import type { NoticeKind } from "../application/notices";
import { NotificationRepository, type NotificationViewer } from "../ports/notification.repository";

// Plain SQL over the TypeORM connection (migration SupportTraceNoticesIntake1792713600000).
type Row = Record<string, unknown>;

const toNotification = (r: Row): Notification => ({
  id: r.id as string,
  recipientUserId: (r.recipient_user_id as string | null) ?? null,
  recipientRole: (r.recipient_role as string | null) ?? null,
  kind: r.kind as NoticeKind,
  title: r.title as string,
  body: r.body as string,
  projectId: (r.project_id as string | null) ?? null,
  milestoneId: (r.milestone_id as string | null) ?? null,
  payload: (r.payload as Record<string, unknown>) ?? {},
  createdAt: r.created_at as Date,
  readAt: (r.read_at as Date | null) ?? null,
});

export class PostgresNotificationRepository extends NotificationRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async save(n: Notification) {
    await this.dataSource.query(
      `INSERT INTO notifications (id, recipient_user_id, recipient_role, kind, title, body, project_id, milestone_id, payload, created_at, read_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [n.id, n.recipientUserId, n.recipientRole, n.kind, n.title, n.body, n.projectId, n.milestoneId, JSON.stringify(n.payload), n.createdAt, n.readAt],
    );
  }

  async listFor(viewer: NotificationViewer, limit: number) {
    const rows: Row[] = await this.dataSource.query(
      "SELECT * FROM notifications WHERE recipient_user_id = $1 OR recipient_role = $2 ORDER BY created_at DESC, id DESC LIMIT $3",
      [viewer.id, viewer.role, limit],
    );
    return rows.map(toNotification);
  }

  async markRead(id: string, viewer: NotificationViewer, at: Date) {
    // COALESCE keeps the first read time: the row is append-only apart from this one field.
    const [rows] = await this.dataSource.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, $4)
       WHERE id = $1 AND (recipient_user_id = $2 OR recipient_role = $3) RETURNING *`,
      [id, viewer.id, viewer.role, at],
    );
    const row = (rows as Row[])[0];
    return row ? toNotification(row) : null;
  }
}
