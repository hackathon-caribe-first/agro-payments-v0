import { NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { readFieldErrors } from "../../projects/infrastructure/http-project-repository";
import type { ReviewRepository } from "../application/review-repository";
import type { NotificationRole, QueueTab } from "../domain/review";
import type { DictamenInput } from "../schemas/dictamen";
import { toDictamenRequestDto, toNotification, toNotifications, toOutbox, toPayoutReceipt, toQueue, toReviewDetail, toReviewEntry } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

export class HttpReviewRepository implements ReviewRepository {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor({ baseUrl, fetchFn }: Options) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchFn = fetchFn;
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
    return toNotifications(await this.json(await this.request(`/notifications?role=${enc(role)}`)));
  }

  async markNotificationRead(notificationId: string) {
    const response = await this.post(`/notifications/${enc(notificationId)}/read`);
    if (response.status === 404) return null;
    return toNotification(await this.json(response));
  }

  async markAllNotificationsRead(role: NotificationRole) {
    await this.json(await this.post(`/notifications/read-all?role=${enc(role)}`));
  }
}
