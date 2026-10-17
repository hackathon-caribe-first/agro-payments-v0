import { NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { readFieldErrors } from "../../projects/infrastructure/http-project-repository";
import type { CertifyBody, DeclareBody, HarvestRepository } from "../application/harvest-repository";
import { toCustody, toHarvestEnvelope, toHarvestEnvelopes, toInvestorPanel } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;
const JSON_HEADERS = { "content-type": "application/json" };

export class HttpHarvestRepository implements HarvestRepository {
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

  // 400 (invalid input) and 409 (business refusal) share one body shape and both surface as field/form errors.
  private async json(response: Response): Promise<unknown> {
    if (response.status === 400 || response.status === 409) throw new ValidationFailure(await readFieldErrors(response));
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return response.json();
  }

  private async orNull<T>(path: string, map: (data: unknown) => T): Promise<T | null> {
    const response = await this.request(path);
    if (response.status === 404) return null;
    return map(await this.json(response));
  }

  private post(path: string, body?: unknown) {
    return this.request(path, { method: "POST", headers: JSON_HEADERS, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  get(projectId: string) {
    return this.orNull(`/projects/${enc(projectId)}/harvest`, toHarvestEnvelope);
  }

  async listForReview() {
    return toHarvestEnvelopes(await this.json(await this.request("/harvests")));
  }

  async declare(projectId: string, b: DeclareBody) {
    const response = await this.post(`/projects/${enc(projectId)}/harvest`, { quantity_kg: b.quantityKg, quality_grade: b.qualityGrade, evidence: b.evidence });
    return toHarvestEnvelope(await this.json(response));
  }

  async certify(projectId: string, b: CertifyBody) {
    const response = await this.post(`/projects/${enc(projectId)}/harvest/certify`, {
      certified_quantity_kg: b.quantityKg,
      quality_grade: b.qualityGrade,
      notes: b.notes,
      price: { price_per_kg: b.pricePerKg },
    });
    return toHarvestEnvelope(await this.json(response));
  }

  async pay(projectId: string) {
    return toHarvestEnvelope(await this.json(await this.post(`/projects/${enc(projectId)}/harvest/payment`)));
  }

  async confirmReception(projectId: string) {
    return toHarvestEnvelope(await this.json(await this.post(`/projects/${enc(projectId)}/harvest/reception`)));
  }

  custody(projectId: string) {
    return this.orNull(`/projects/${enc(projectId)}/custody`, toCustody);
  }

  panel(projectId: string) {
    return this.orNull(`/investor/projects/${enc(projectId)}/panel`, toInvestorPanel);
  }
}
