import type { MilestoneRepository } from "../application/milestone-repository";
import { FORM_LEVEL_KEY, NetworkError, ValidationFailure, type FieldErrors } from "../domain/errors";
import type { EvidenceLogRequestDto } from "./dto";
import { toEvidenceLog, toMilestoneDetail, toMilestoneSummaries } from "./mapper";
import { toEvidenceFieldErrors, type EvidenceLogInput } from "../schemas/evidence-log";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

export class HttpMilestoneRepository implements MilestoneRepository {
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

  private async readJson(response: Response): Promise<unknown> {
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return response.json();
  }

  // 400 body: { error, errors: { [fieldPath]: string[] } }; an empty map still says the log was refused.
  private async readFieldErrors(response: Response): Promise<FieldErrors> {
    const body = (await response.json().catch(() => null)) as { errors?: unknown } | null;
    const errors = body && typeof body.errors === "object" && body.errors !== null ? (body.errors as FieldErrors) : {};
    return Object.keys(errors).length > 0 ? toEvidenceFieldErrors(errors) : { [FORM_LEVEL_KEY]: ["El servidor rechazó el registro."] };
  }

  async listByProject(projectId: string) {
    const response = await this.request(`/projects/${encodeURIComponent(projectId)}/milestones`);
    return toMilestoneSummaries(await this.readJson(response));
  }

  async getDetail(milestoneId: string) {
    const response = await this.request(`/milestones/${encodeURIComponent(milestoneId)}`);
    if (response.status === 404) return null;
    return toMilestoneDetail(await this.readJson(response));
  }

  async addEvidenceLog(milestoneId: string, input: EvidenceLogInput) {
    const body: EvidenceLogRequestDto = {
      log_type: input.logType,
      notes: input.notes,
      evidence_payload: input.evidencePayload,
      ...(input.location && { location: input.location }),
      ...(input.photoHashes && input.photoHashes.length > 0 && { photo_hashes: input.photoHashes }),
    };
    const response = await this.request(`/milestones/${encodeURIComponent(milestoneId)}/logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status === 400) throw new ValidationFailure(await this.readFieldErrors(response));
    return toEvidenceLog(await this.readJson(response));
  }

  async submitForReview(milestoneId: string) {
    const response = await this.request(`/milestones/${encodeURIComponent(milestoneId)}/submit`, { method: "POST" });
    return toMilestoneDetail(await this.readJson(response));
  }
}
