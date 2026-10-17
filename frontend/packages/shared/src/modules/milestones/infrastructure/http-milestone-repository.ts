import type { MilestoneRepository } from "../application/milestone-repository";
import { NetworkError } from "../domain/errors";
import type { EvidenceLogRequestDto } from "./dto";
import { toEvidenceLog, toMilestoneDetail, toMilestoneSummaries } from "./mapper";
import type { EvidenceLogInput } from "../schemas/evidence-log";

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
    };
    const response = await this.request(`/milestones/${encodeURIComponent(milestoneId)}/logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return toEvidenceLog(await this.readJson(response));
  }

  async submitForReview(milestoneId: string) {
    const response = await this.request(`/milestones/${encodeURIComponent(milestoneId)}/submit`, { method: "POST" });
    return toMilestoneDetail(await this.readJson(response));
  }
}
