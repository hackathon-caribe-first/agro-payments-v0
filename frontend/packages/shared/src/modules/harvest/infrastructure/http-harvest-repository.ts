import { NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { readFieldErrors } from "../../projects/infrastructure/http-project-repository";
import type { HarvestRepository } from "../application/harvest-repository";
import type { CertifyHarvestInput } from "../schemas/certify-harvest";
import type { DeclareHarvestInput } from "../schemas/declare-harvest";
import type { DispatchOrderInput } from "../schemas/order-forms";
import { toBatch, toBatches, toCertifyBody, toDeclarationContext, toDeclareBody, toDispatchBody, toOrder, toOrderDetail, toOrders, toSettlements } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

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

  // 400 (invalid input) and 409 (business conflict) share one body shape and both surface as field/form errors.
  private async json(response: Response): Promise<unknown> {
    if (response.status === 400 || response.status === 409) throw new ValidationFailure(await readFieldErrors(response));
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return response.json();
  }

  private async post(path: string, body?: unknown) {
    return this.json(
      await this.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  }

  private async getOrNull(path: string): Promise<unknown | null> {
    const response = await this.request(path);
    if (response.status === 404) return null;
    return this.json(response);
  }

  private query(params: Record<string, string | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    return search.size > 0 ? `?${search.toString()}` : "";
  }

  async getDeclarationContext(projectId: string) {
    const raw = await this.getOrNull(`/harvest/projects/${enc(projectId)}/declaration`);
    return raw === null ? null : toDeclarationContext(raw);
  }

  async declare(projectId: string, input: DeclareHarvestInput) {
    return toBatch(await this.post(`/harvest/projects/${enc(projectId)}/batches`, toDeclareBody(input)));
  }

  async resubmit(batchId: string, input: DeclareHarvestInput) {
    return toBatch(await this.post(`/harvest/batches/${enc(batchId)}/resubmit`, toDeclareBody(input)));
  }

  async listBatches(filter: { status?: string; producerId?: string }) {
    return toBatches(await this.json(await this.request(`/harvest/batches${this.query({ status: filter.status, producer_id: filter.producerId })}`)));
  }

  async getBatch(batchId: string) {
    const raw = await this.getOrNull(`/harvest/batches/${enc(batchId)}`);
    return raw === null ? null : toBatch(raw);
  }

  async certify(batchId: string, input: CertifyHarvestInput) {
    return toBatch(await this.post(`/harvest/batches/${enc(batchId)}/certify`, toCertifyBody(input)));
  }

  async requestCorrections(batchId: string, comments: string) {
    return toBatch(await this.post(`/harvest/batches/${enc(batchId)}/request-corrections`, { comments }));
  }

  async listLots(productionType?: string) {
    return toBatches(await this.json(await this.request(`/marketplace/lots${this.query({ type: productionType })}`)));
  }

  async getLot(batchId: string) {
    const raw = await this.getOrNull(`/marketplace/lots/${enc(batchId)}`);
    return raw === null ? null : toBatch(raw);
  }

  async createOrder(batchId: string, buyerId: string, quantityKg: number) {
    return toOrder(await this.post("/orders", { batch_id: batchId, buyer_id: buyerId, quantity_kg: quantityKg }));
  }

  async listOrders(filter: { buyerId?: string; producerId?: string }) {
    return toOrders(await this.json(await this.request(`/orders${this.query({ buyer_id: filter.buyerId, producer_id: filter.producerId })}`)));
  }

  async getOrderDetail(orderId: string) {
    const raw = await this.getOrNull(`/orders/${enc(orderId)}`);
    return raw === null ? null : toOrderDetail(raw);
  }

  async authorizePayment(orderId: string, buyerId: string, expectedTotal: number) {
    return toOrderDetail(await this.post(`/orders/${enc(orderId)}/authorize-payment`, { buyer_id: buyerId, expected_total: expectedTotal }));
  }

  async revokeAuthorization(orderId: string, buyerId: string) {
    return toOrderDetail(await this.post(`/orders/${enc(orderId)}/revoke-authorization`, { buyer_id: buyerId }));
  }

  async cancelOrder(orderId: string, buyerId: string) {
    return toOrderDetail(await this.post(`/orders/${enc(orderId)}/cancel`, { buyer_id: buyerId }));
  }

  async dispatch(orderId: string, input: DispatchOrderInput) {
    return toOrderDetail(await this.post(`/orders/${enc(orderId)}/dispatch`, toDispatchBody(input)));
  }

  async confirmReception(orderId: string, buyerId: string) {
    return toOrderDetail(await this.post(`/orders/${enc(orderId)}/confirm-reception`, { buyer_id: buyerId }));
  }

  async listAllSettlements() {
    return toSettlements(await this.json(await this.request("/settlements")));
  }

  async listSettlements(projectId: string) {
    return toSettlements(await this.json(await this.request(`/settlements/projects/${enc(projectId)}`)));
  }
}
