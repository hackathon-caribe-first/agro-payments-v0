import { NetworkError } from "../../milestones/domain/errors";
import type { PaymentAuthorizationRepository } from "../application/payment-authorization-repository";
import { toPaymentAuthorizations } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

export class HttpPaymentAuthorizationRepository implements PaymentAuthorizationRepository {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor({ baseUrl, fetchFn }: Options) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchFn = fetchFn;
  }

  async listProjectAuthorizations(projectId: string) {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/projects/${encodeURIComponent(projectId)}/payment-authorizations`);
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return toPaymentAuthorizations(await response.json());
  }
}
