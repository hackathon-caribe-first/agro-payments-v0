import { InProcessDomainEvents } from "../../../shared/events/domain-events";
import { AssistantInbox } from "../../assistant/ports/assistant-inbox";
import { FakeRepository } from "../../milestones/application/testing";
import { buildProject } from "../../projects/application/project";
import { FakeProjectRepository } from "../../projects/application/testing";
import { NotificationRepository, type NotificationViewer } from "../ports/notification.repository";
import { type Notification, NotificationsService } from "./notifications";

class MemoryNotifications extends NotificationRepository {
  readonly rows: Notification[] = [];
  async save(n: Notification) {
    this.rows.push(structuredClone(n));
  }
  async listFor(viewer: NotificationViewer, limit: number) {
    return this.rows
      .filter((n) => n.recipientUserId === viewer.id || n.recipientRole === viewer.role)
      .reverse()
      .slice(0, limit);
  }
  async markRead(id: string, viewer: NotificationViewer, at: Date) {
    const n = this.rows.find((r) => r.id === id && (r.recipientUserId === viewer.id || r.recipientRole === viewer.role));
    if (!n) return null;
    n.readAt ??= at;
    return structuredClone(n);
  }
}

class Inbox extends AssistantInbox {
  readonly delivered: { userId: string; text: string }[] = [];
  fail = false;
  async deliver(userId: string, text: string) {
    if (this.fail) throw new Error("store down");
    this.delivered.push({ userId, text });
  }
}

async function setup() {
  const projects = new FakeProjectRepository(new FakeRepository(new Map()));
  const { project, milestones } = buildProject({
    id: "p-1",
    ownerUserId: "u-prod",
    now: new Date(),
    wallets: { producer: "https://w", supplier: "https://w", platform: "https://w" },
    input: {
      title: "Tomate P2",
      description: "Tomate bajo invernadero",
      productionType: "OTRO",
      startDate: "2026-11-01",
      estimatedEndDate: "2027-03-30",
      milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 1, laborBudget: 1, requirements: [] }],
    },
  });
  await projects.create(project, milestones);
  const repo = new MemoryNotifications();
  const inbox = new Inbox();
  const events = new InProcessDomainEvents();
  const service = new NotificationsService(repo, projects, inbox, events);
  service.onModuleInit();
  return { repo, inbox, events, service };
}

describe("NotificationsService (RF-37)", () => {
  it("stores the producer's notice and says it in their assistant conversation", async () => {
    const { repo, inbox, events } = await setup();
    events.publish({ type: "milestone.observed", projectId: "p-1", milestoneId: "p-1-ms-1", milestoneTitle: "Siembra", reason: "Falta la foto." });
    await events.drain();
    expect(repo.rows).toEqual([
      expect.objectContaining({ recipientUserId: "u-prod", recipientRole: null, kind: "milestone_observed", projectId: "p-1", milestoneId: "p-1-ms-1", readAt: null }),
    ]);
    expect(inbox.delivered).toEqual([{ userId: "u-prod", text: repo.rows[0].body }]);
  });

  it("addresses verifier notices to the role and never to the assistant", async () => {
    const { repo, inbox, events } = await setup();
    events.publish({ type: "evidence.recorded", projectId: "p-1", milestoneId: "p-1-ms-1", milestoneTitle: "Siembra", stage: "submitted", photoCount: 1, location: null });
    await events.drain();
    expect(repo.rows[0]).toMatchObject({ recipientUserId: null, recipientRole: "verifier", kind: "evidence_submitted" });
    expect(inbox.delivered).toEqual([]);
  });

  it("keeps the notice when the assistant cannot take it", async () => {
    const { repo, inbox, events } = await setup();
    inbox.fail = true;
    events.publish({ type: "project.funded", projectId: "p-1" });
    await events.drain();
    expect(repo.rows).toHaveLength(1);
  });

  it("lists the viewer's own and role notices and marks one read only for its recipient", async () => {
    const { service, events } = await setup();
    events.publish({ type: "project.funded", projectId: "p-1" });
    events.publish({ type: "evidence.recorded", projectId: "p-1", milestoneId: "p-1-ms-1", milestoneTitle: "Siembra", stage: "log", photoCount: 0, location: null });
    await events.drain();
    const mine = await service.list({ id: "u-prod", role: "seller" });
    expect(mine.map((n) => n.kind)).toEqual(["project_activated"]);
    expect((await service.list({ id: "v-1", role: "verifier" })).map((n) => n.kind)).toEqual(["evidence_logged"]);

    await expect(service.markRead(mine[0].id, { id: "u-other", role: "seller" })).rejects.toThrow("not found");
    expect((await service.markRead(mine[0].id, { id: "u-prod", role: "seller" })).readAt).toBeInstanceOf(Date);
  });
});
