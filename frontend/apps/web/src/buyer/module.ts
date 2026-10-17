import { createPresalesModule } from "@agro/shared/modules/presales/infrastructure/presales-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// There is no authentication yet: the buyer is a fixed profile.
export const BUYER_PROFILE = { id: "buyer-andina", name: "Comercializadora Andina S.A.S." } as const;

const presales = createPresalesModule({ fetchFn: transport, baseUrl: API_BASE_URL });

// Buyer-side operations. Every write acts as BUYER.
export const buyer = {
  listOpenListings: presales.listOpenListings,
  getListingDetail: presales.getListingDetail,

  // Starting a negotiation from a project's presale.
  requestQuote: (listingId: string, raw: unknown) => presales.requestQuote(listingId, BUYER_PROFILE, raw),
  listMyRequests: () => presales.listBuyerRequests(BUYER_PROFILE.id),
  getRequestDetail: (requestId: string) => presales.getRequestDetail(requestId, "BUYER"),
  counterOffer: (requestId: string, raw: unknown) => presales.counterOffer(requestId, "BUYER", raw),
  acceptSaleQuote: (requestId: string, revision: unknown) => presales.acceptSaleQuote(requestId, revision, "BUYER"),
  rejectSaleQuote: (requestId: string, revision: unknown) => presales.rejectSaleQuote(requestId, revision, "BUYER"),
  withdrawNegotiation: (requestId: string) => presales.withdrawNegotiation(requestId, "BUYER"),

  createOpenRequest: (raw: unknown) => presales.createOpenRequest(BUYER_PROFILE, raw),
  closeOpenRequest: presales.closeOpenRequest,
  listMyOpenRequests: () => presales.listBuyerOpenRequests(BUYER_PROFILE.id),
  getOpenRequestBoard: presales.getOpenRequestBoard,
};
