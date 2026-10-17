import { NetworkError } from "../../milestones/domain/errors";
import type { PaymentAuthorizationRepository } from "../application/payment-authorization-repository";
import { toLedgerEntries } from "../../escrow/infrastructure/mapper";
import type { PaymentAuthorization } from "../domain/authorization";

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
      // Our backend has no /payment-authorizations: a buyer's authorization is its BUYER_DEPOSIT entry in the escrow ledger.
      response = await this.fetchFn(`${this.baseUrl}/projects/${encodeURIComponent(projectId)}/escrow-ledger`);
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return toLedgerEntries(await response.json())
      .filter((e) => e.category === "BUYER_DEPOSIT")
      .map(
        (e): PaymentAuthorization => ({
          id: e.id,
          negotiationId: e.negotiationId,
          projectId: e.projectId,
          buyerId: e.buyerId,
          cap: e.amount,
          spent: 0,
          currency: e.currency,
          status: "AUTHORIZED",
          createdAt: e.createdAt,
          revokedAt: null,
        }),
      );
  }
}
