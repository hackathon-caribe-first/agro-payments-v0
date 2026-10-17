import type { Actor, OpenRequest, PresaleListing, QuoteRequest } from "../domain/presale";
import type { CounterOfferInput } from "../schemas/counter-offer";
import type { CreateOpenRequestInput } from "../schemas/create-open-request";
import type { PublishListingInput } from "../schemas/publish-listing";
import type { RequestQuoteInput } from "../schemas/request-quote";
import type { RespondQuoteInput } from "../schemas/respond-quote";
import type { StartOpenRequestNegotiationInput } from "../schemas/start-open-request-negotiation";

// Either side of a negotiation (there is no authentication yet: both are fixed profiles).
export interface PartyIdentity {
  id: string;
  name: string;
}
export type BuyerIdentity = PartyIdentity;

// Port for presale and negotiation data. Implementations throw BoundaryError, NetworkError or ValidationFailure.
export interface PresaleRepository {
  // listings
  listOpenListings(): Promise<PresaleListing[]>;
  getListing(listingId: string): Promise<PresaleListing | null>;
  listByProject(projectId: string): Promise<PresaleListing[]>;
  publish(projectId: string, input: PublishListingInput): Promise<PresaleListing>;
  close(listingId: string): Promise<PresaleListing>;

  // negotiations
  createRequest(listingId: string, buyer: PartyIdentity, input: RequestQuoteInput): Promise<QuoteRequest>;
  getRequest(requestId: string): Promise<QuoteRequest | null>;
  listBuyerRequests(buyerId: string): Promise<QuoteRequest[]>;
  listProducerRequests(projectId?: string, producerId?: string): Promise<QuoteRequest[]>;

  respond(requestId: string, input: RespondQuoteInput): Promise<QuoteRequest>;
  counter(requestId: string, author: Actor, input: CounterOfferInput): Promise<QuoteRequest>;
  decline(requestId: string): Promise<QuoteRequest>;
  cancel(requestId: string): Promise<QuoteRequest>;
  withdraw(requestId: string, actor: Actor): Promise<QuoteRequest>;
  acceptQuote(requestId: string, revision: number, actor?: Actor): Promise<QuoteRequest>;
  rejectQuote(requestId: string, revision: number, actor?: Actor): Promise<QuoteRequest>;

  // open requests
  createOpenRequest(buyer: PartyIdentity, input: CreateOpenRequestInput): Promise<OpenRequest>;
  getOpenRequest(openRequestId: string): Promise<OpenRequest | null>;
  listOpenRequests(status?: string): Promise<OpenRequest[]>;
  listBuyerOpenRequests(buyerId: string): Promise<OpenRequest[]>;
  closeOpenRequest(openRequestId: string): Promise<OpenRequest>;
  listOpenRequestNegotiations(openRequestId: string): Promise<QuoteRequest[]>;
  startOpenRequestNegotiation(openRequestId: string, producer: PartyIdentity, input: StartOpenRequestNegotiationInput): Promise<QuoteRequest>;
}
