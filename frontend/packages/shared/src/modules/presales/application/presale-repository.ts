import type { Actor, CatalogProject, OpenRequest, QuoteRequest } from "../domain/presale";
import type { MilestoneTermsInput } from "../schemas/start-milestone-negotiation";
import type { ProjectTermsInput } from "../schemas/start-project-negotiation";
import type { CounterOfferInput } from "../schemas/counter-offer";
import type { CreateOpenRequestInput } from "../schemas/create-open-request";
import type { StartOpenRequestNegotiationInput } from "../schemas/start-open-request-negotiation";

// Either side of a negotiation (there is no authentication yet: both are fixed profiles).
export interface PartyIdentity {
  id: string;
  name: string;
}
export type BuyerIdentity = PartyIdentity;

// What the buyer opens a negotiation on: the whole project or one of its milestones.
export type StartTarget =
  | { scope: "PROJECT"; input: ProjectTermsInput }
  | { scope: "MILESTONE"; milestoneId: string; input: MilestoneTermsInput };

// Port for presale and negotiation data. Implementations throw BoundaryError, NetworkError or ValidationFailure.
export interface PresaleRepository {
  // project catalog and project negotiations
  listCatalog(): Promise<CatalogProject[]>;
  getCatalogProject(projectId: string): Promise<CatalogProject | null>;
  startNegotiation(projectId: string, buyer: PartyIdentity, target: StartTarget): Promise<QuoteRequest>;
  counterProject(requestId: string, author: Actor, input: ProjectTermsInput): Promise<QuoteRequest>;
  counterMilestone(requestId: string, author: Actor, input: MilestoneTermsInput): Promise<QuoteRequest>;
  deposit(requestId: string, buyer: PartyIdentity, expectedTotal: number): Promise<QuoteRequest>;

  // negotiations
  getRequest(requestId: string): Promise<QuoteRequest | null>;
  listBuyerRequests(buyerId: string): Promise<QuoteRequest[]>;
  listProducerRequests(projectId?: string, producerId?: string): Promise<QuoteRequest[]>;

  counter(requestId: string, author: Actor, input: CounterOfferInput): Promise<QuoteRequest>;
  withdraw(requestId: string, actor: Actor): Promise<QuoteRequest>;
  acceptQuote(requestId: string, revision: number, actor?: Actor, expectedTotal?: number): Promise<QuoteRequest>;
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
