import { NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { readFieldErrors } from "../../projects/infrastructure/http-project-repository";
import type { PartyIdentity, PresaleRepository } from "../application/presale-repository";
import type { Actor } from "../domain/presale";
import type { CounterOfferInput } from "../schemas/counter-offer";
import type { CreateOpenRequestInput } from "../schemas/create-open-request";
import type { PublishListingInput } from "../schemas/publish-listing";
import type { RequestQuoteInput } from "../schemas/request-quote";
import type { RespondQuoteInput } from "../schemas/respond-quote";
import type { StartOpenRequestNegotiationInput } from "../schemas/start-open-request-negotiation";
import {
  toCreateOpenRequestDto,
  toCreateRequestDto,
  toListing,
  toListings,
  toOfferRequestDto,
  toOpenRequest,
  toOpenRequests,
  toPublishRequestDto,
  toQuoteRequest,
  toQuoteRequests,
  toStartNegotiationDto,
} from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

export class HttpPresaleRepository implements PresaleRepository {
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

  private post(path: string, body?: unknown) {
    return this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private async get(path: string) {
    return this.json(await this.request(path));
  }

  // ---- listings ----

  async listOpenListings() {
    return toListings(await this.get("/presales?status=OPEN"));
  }

  async getListing(listingId: string) {
    const response = await this.request(`/presales/${enc(listingId)}`);
    if (response.status === 404) return null;
    return toListing(await this.json(response));
  }

  async listByProject(projectId: string) {
    return toListings(await this.get(`/projects/${enc(projectId)}/presales`));
  }

  async publish(projectId: string, input: PublishListingInput) {
    return toListing(await this.json(await this.post(`/projects/${enc(projectId)}/presales`, toPublishRequestDto(input))));
  }

  async close(listingId: string) {
    return toListing(await this.json(await this.post(`/presales/${enc(listingId)}/close`)));
  }

  // ---- negotiations ----

  async createRequest(listingId: string, buyer: PartyIdentity, input: RequestQuoteInput) {
    const response = await this.post(`/presales/${enc(listingId)}/quote-requests`, toCreateRequestDto(buyer, input));
    return toQuoteRequest(await this.json(response));
  }

  async getRequest(requestId: string) {
    const response = await this.request(`/quote-requests/${enc(requestId)}`);
    if (response.status === 404) return null;
    return toQuoteRequest(await this.json(response));
  }

  async listBuyerRequests(buyerId: string) {
    return toQuoteRequests(await this.get(`/buyers/${enc(buyerId)}/quote-requests`));
  }

  async listProducerRequests(projectId?: string, producerId?: string) {
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    if (producerId) params.set("producer_id", producerId);
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return toQuoteRequests(await this.get(`/producer/quote-requests${query}`));
  }

  async respond(requestId: string, input: RespondQuoteInput) {
    return toQuoteRequest(await this.json(await this.post(`/quote-requests/${enc(requestId)}/quotes`, toOfferRequestDto(input))));
  }

  async counter(requestId: string, author: Actor, input: CounterOfferInput) {
    return toQuoteRequest(await this.json(await this.post(`/quote-requests/${enc(requestId)}/quotes`, toOfferRequestDto(input, author))));
  }

  async decline(requestId: string) {
    return toQuoteRequest(await this.json(await this.post(`/quote-requests/${enc(requestId)}/decline`)));
  }

  async cancel(requestId: string) {
    return toQuoteRequest(await this.json(await this.post(`/quote-requests/${enc(requestId)}/cancel`)));
  }

  async withdraw(requestId: string, actor: Actor) {
    return toQuoteRequest(await this.json(await this.post(`/quote-requests/${enc(requestId)}/withdraw`, { actor })));
  }

  async acceptQuote(requestId: string, revision: number, actor?: Actor) {
    const response = await this.post(`/quote-requests/${enc(requestId)}/quotes/${revision}/accept`, actor ? { actor } : undefined);
    return toQuoteRequest(await this.json(response));
  }

  async rejectQuote(requestId: string, revision: number, actor?: Actor) {
    const response = await this.post(`/quote-requests/${enc(requestId)}/quotes/${revision}/reject`, actor ? { actor } : undefined);
    return toQuoteRequest(await this.json(response));
  }

  // ---- open requests ----

  async createOpenRequest(buyer: PartyIdentity, input: CreateOpenRequestInput) {
    return toOpenRequest(await this.json(await this.post("/open-requests", toCreateOpenRequestDto(buyer, input))));
  }

  async getOpenRequest(openRequestId: string) {
    const response = await this.request(`/open-requests/${enc(openRequestId)}`);
    if (response.status === 404) return null;
    return toOpenRequest(await this.json(response));
  }

  async listOpenRequests(status?: string) {
    return toOpenRequests(await this.get(`/open-requests${status ? `?status=${enc(status)}` : ""}`));
  }

  async listBuyerOpenRequests(buyerId: string) {
    return toOpenRequests(await this.get(`/buyers/${enc(buyerId)}/open-requests`));
  }

  async closeOpenRequest(openRequestId: string) {
    return toOpenRequest(await this.json(await this.post(`/open-requests/${enc(openRequestId)}/close`)));
  }

  async listOpenRequestNegotiations(openRequestId: string) {
    return toQuoteRequests(await this.get(`/open-requests/${enc(openRequestId)}/negotiations`));
  }

  async startOpenRequestNegotiation(openRequestId: string, producer: PartyIdentity, input: StartOpenRequestNegotiationInput) {
    const response = await this.post(`/open-requests/${enc(openRequestId)}/negotiations`, toStartNegotiationDto(producer, input));
    return toQuoteRequest(await this.json(response));
  }
}
