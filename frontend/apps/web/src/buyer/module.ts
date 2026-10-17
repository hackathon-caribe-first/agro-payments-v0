import { createPresalesModule } from "@agro/shared/modules/presales/infrastructure/presales-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// There is no authentication yet: the buyer is a fixed profile.
export const BUYER_PROFILE = { id: "buyer-andina", name: "Comercializadora Andina S.A.S." } as const;

const presales = createPresalesModule({ fetchFn: transport, baseUrl: API_BASE_URL });

// Buyer-side operations. Every write acts as BUYER.
export const buyer = {
  listMyRequests: () => presales.listBuyerRequests(BUYER_PROFILE.id),
  getRequestDetail: (requestId: string) => presales.getRequestDetail(requestId, "BUYER"),
  counterOffer: (requestId: string, raw: unknown) => presales.counterOffer(requestId, "BUYER", raw),
  acceptSaleQuote: (requestId: string, revision: unknown, raw?: unknown) => presales.acceptSaleQuote(requestId, revision, "BUYER", raw),
  rejectSaleQuote: (requestId: string, revision: unknown) => presales.rejectSaleQuote(requestId, revision, "BUYER"),
  withdrawNegotiation: (requestId: string) => presales.withdrawNegotiation(requestId, "BUYER"),

  // Project negotiation: browse projects, negotiate the project or a milestone, deposit an agreed project.
  listCatalog: () => presales.listBuyerCatalog(BUYER_PROFILE.id),
  getProjectDetail: (projectId: string) => presales.getBuyerProjectDetail(projectId, BUYER_PROFILE.id),
  getStartNegotiationForm: (projectId: string, milestoneId: string | null) =>
    presales.getStartNegotiationForm(projectId, milestoneId, BUYER_PROFILE.id),
  startNegotiation: (target: { projectId: string; milestoneId: string | null }, raw: unknown) =>
    presales.startNegotiation(target, BUYER_PROFILE, raw),
  depositProjectAgreement: (negotiationId: string, raw: unknown) => presales.depositProjectAgreement(negotiationId, BUYER_PROFILE, raw),

  createOpenRequest: (raw: unknown) => presales.createOpenRequest(BUYER_PROFILE, raw),
  closeOpenRequest: presales.closeOpenRequest,
  listMyOpenRequests: () => presales.listBuyerOpenRequests(BUYER_PROFILE.id),
  getOpenRequestBoard: presales.getOpenRequestBoard,
};
