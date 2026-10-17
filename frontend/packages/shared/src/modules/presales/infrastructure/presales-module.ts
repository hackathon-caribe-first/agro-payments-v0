import {
  depositProjectAgreement,
  getBuyerProjectDetail,
  getStartNegotiationForm,
  listBuyerCatalog,
  startNegotiation,
} from "../application/project-negotiation";
import { HttpMilestoneRepository } from "../../milestones/infrastructure/http-milestone-repository";
import { HttpProjectRepository } from "../../projects/infrastructure/http-project-repository";
import {
  acceptSaleQuote,
  closeOpenRequest,
  counterOffer,
  createOpenRequest,
  getOpenRequestBoard,
  getOpenRequestForProducer,
  getRequestDetail,
  listBuyerOpenRequests,
  listBuyerRequests,
  listOpenRequestCatalog,
  listProducerRequests,
  rejectSaleQuote,
  startOpenRequestNegotiation,
  withdrawNegotiation,
  type PresaleDeps,
} from "../application/use-cases";
import type { PartyIdentity } from "../application/presale-repository";
import type { Actor } from "../domain/presale";
import { isoToday } from "../domain/presale-rules";
import { HttpPresaleRepository } from "./http-presale-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
  today?: () => string;
  // The producer this module acts as (producer-side wrappers pass it; buyer-side leaves it out).
  producerId?: string;
}

const DEFAULT_BASE_URL = "/api";

// Binds every presale use case to one repository set over the given transport.
export function createPresalesModule({ fetchFn, baseUrl = DEFAULT_BASE_URL, today = isoToday, producerId }: Options) {
  const deps: PresaleDeps = {
    presales: new HttpPresaleRepository({ baseUrl, fetchFn }),
    projects: new HttpProjectRepository({ baseUrl, fetchFn }),
    milestones: new HttpMilestoneRepository({ baseUrl, fetchFn }),
    today,
    ownProducerId: producerId ?? null,
  };

  return {
    // Flow A: project negotiation
    listBuyerCatalog: (buyerId: string) => listBuyerCatalog(deps, buyerId),
    getBuyerProjectDetail: (projectId: string, buyerId: string) => getBuyerProjectDetail(deps, projectId, buyerId),
    getStartNegotiationForm: (projectId: string, milestoneId: string | null, buyerId: string) =>
      getStartNegotiationForm(deps, projectId, milestoneId, buyerId),
    startNegotiation: (target: { projectId: string; milestoneId: string | null }, buyer: PartyIdentity, raw: unknown) =>
      startNegotiation(deps, target, buyer, raw),
    depositProjectAgreement: (negotiationId: string, buyer: PartyIdentity, raw: unknown) =>
      depositProjectAgreement(deps, negotiationId, buyer, raw),

    counterOffer: (requestId: string, actor: Actor, raw: unknown) => counterOffer(deps, requestId, actor, raw),
    acceptSaleQuote: (requestId: string, revision: unknown, actor?: Actor, raw?: unknown) => acceptSaleQuote(deps, requestId, revision, actor, raw),
    rejectSaleQuote: (requestId: string, revision: unknown, actor?: Actor) => rejectSaleQuote(deps, requestId, revision, actor),
    withdrawNegotiation: (requestId: string, actor: Actor) => withdrawNegotiation(deps, requestId, actor),
    listBuyerRequests: (buyerId: string) => listBuyerRequests(deps, buyerId),
    listProducerRequests: (projectId?: string) => listProducerRequests(deps, projectId),
    getRequestDetail: (requestId: string, viewer?: Actor) => getRequestDetail(deps, requestId, viewer),

    createOpenRequest: (buyer: PartyIdentity, raw: unknown) => createOpenRequest(deps, buyer, raw),
    closeOpenRequest: (openRequestId: string) => closeOpenRequest(deps, openRequestId),
    listBuyerOpenRequests: (buyerId: string) => listBuyerOpenRequests(deps, buyerId),
    getOpenRequestBoard: (openRequestId: string) => getOpenRequestBoard(deps, openRequestId),
    listOpenRequestCatalog: () => listOpenRequestCatalog(deps),
    getOpenRequestForProducer: (openRequestId: string) => getOpenRequestForProducer(deps, openRequestId),
    startOpenRequestNegotiation: (openRequestId: string, producer: PartyIdentity, raw: unknown) =>
      startOpenRequestNegotiation(deps, openRequestId, producer, raw),
  };
}

export type PresalesModule = ReturnType<typeof createPresalesModule>;
