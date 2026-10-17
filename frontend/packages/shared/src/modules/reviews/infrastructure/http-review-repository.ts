import { NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { readFieldErrors } from "../../projects/infrastructure/http-project-repository";
import type { ReviewRepository } from "../application/review-repository";
import type { NotificationRole, QueueTab } from "../domain/review";
import type { DictamenInput } from "../schemas/dictamen";
import { toDictamenRequestDto, toNotification, toNotifications, toOutbox, toPayoutReceipt, toQueue, toReviewDetail, toReviewEntry } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
  // Our backend's notices (GET /api/notifications, POST /api/notifications/:id/read): the session decides the recipient, so the
  // role filter is applied client-side. When absent, the notices go to the same transport as the reviews (mock).
  backendNotifications?: { baseUrl: string; fetchFn: typeof fetch };
}

// GET /api/notifications row (backend wire).
interface BackendNotificationDto {
  id: string;
  title: string;
  body: string;
  project_id: string | null;
  milestone_id: string | null;
  created_at: string;
  read_at: string | null;
}

const fromBackend = (role: NotificationRole, n: BackendNotificationDto) => ({
  id: n.id,
  role,
  title: n.title,
  body: n.body,
  milestone_id: n.milestone_id ?? "",
  href: n.milestone_id && role === "PRODUCER" ? `/producer/milestones/${n.milestone_id}` : null,
  created_at: n.created_at,
  read_at: n.read_at,
});

const enc = encodeURIComponent;

export class HttpReviewRepository implements ReviewRepository {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  private readonly backend: Options["backendNotifications"];

  constructor({ baseUrl, fetchFn, backendNotifications }: Options) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchFn = fetchFn;
    this.backend = backendNotifications && { ...backendNotifications, baseUrl: backendNotifications.baseUrl.replace(/\/$/, "") };
  }

  private async backendRequest(path: string, init?: RequestInit): Promise<Response> {
    const backend = this.backend!;
    try {
      return await backend.fetchFn(`${backend.baseUrl}${path}`, { credentials: "include", ...init });
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
    }
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
    }
  }

  // 400 (invalid input) and 409 (business conflict) share one body shape.
  private async json(response: Response): Promise<unknown> {
    if (response.status === 400 || response.status === 409) throw new ValidationFailure(await readFieldErrors(response));
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return response.json();
  }

  private post(path: string, body?: unknown) {
    return this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async listQueue(verifierId: string, tab: QueueTab) {
    return toQueue(await this.json(await this.request(`/reviews/queue?verifier_id=${enc(verifierId)}&tab=${enc(tab)}`)));
  }

  async getDetail(milestoneId: string, verifierId: string) {
    const response = await this.request(`/reviews/${enc(milestoneId)}?verifier_id=${enc(verifierId)}`);
    if (response.status === 404) return null;
    return toReviewDetail(await this.json(response));
  }

  async submitDictamen(milestoneId: string, verifierId: string, input: DictamenInput) {
    return toReviewEntry(await this.json(await this.post(`/reviews/${enc(milestoneId)}/dictamen`, toDictamenRequestDto(verifierId, input))));
  }

  async confirmPayout(milestoneId: string, actorId: string) {
    return toPayoutReceipt(await this.json(await this.post(`/reviews/${enc(milestoneId)}/confirm-payout`, { actor_id: actorId })));
  }

  async listOutbox() {
    return toOutbox(await this.json(await this.request("/reviews/outbox")));
  }

  async listNotifications(role: NotificationRole) {
    if (this.backend) {
      const rows = (await this.json(await this.backendRequest("/notifications"))) as BackendNotificationDto[];
      return toNotifications(rows.map((n) => fromBackend(role, n)));
    }
    return toNotifications(await this.json(await this.request(`/notifications?role=${enc(role)}`)));
  }

  async markNotificationRead(notificationId: string) {
    if (this.backend) {
      const response = await this.backendRequest(`/notifications/${enc(notificationId)}/read`, { method: "POST" });
      if (response.status === 404) return null;
      const row = (await this.json(response)) as BackendNotificationDto;
      // The backend does not know the web role of a notice; the read view only needs read_at.
      return toNotification(fromBackend("PRODUCER", row));
    }
    const response = await this.post(`/notifications/${enc(notificationId)}/read`);
    if (response.status === 404) return null;
    return toNotification(await this.json(response));
  }

  async markAllNotificationsRead(role: NotificationRole) {
    if (this.backend) {
      const rows = await this.listNotifications(role);
      await Promise.all(rows.filter((n) => n.readAt === null).map((n) => this.markNotificationRead(n.id)));
      return;
    }
    await this.json(await this.post(`/notifications/read-all?role=${enc(role)}`));
  }
}
