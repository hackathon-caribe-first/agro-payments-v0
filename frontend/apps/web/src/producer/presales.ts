import { createPresalesModule } from "@agro/shared/modules/presales/infrastructure/presales-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// There is no authentication yet: the producer is a fixed profile.
// Keep in sync with LOCAL_PRODUCER in the shared mock fixtures (the mock stamps its listings and offers with it).
export const PRODUCER_PROFILE = { id: "producer-main", name: "Agrícola La Esperanza S.A.S." } as const;

const presales = createPresalesModule({ fetchFn: transport, baseUrl: API_BASE_URL, producerId: PRODUCER_PROFILE.id });

// Producer-side presale and negotiation operations. Every write acts as PRODUCER.
export const producerPresales = {
  publishListing: presales.publishListing,
  closeListing: presales.closeListing,
  getProjectPresale: presales.getProjectPresale,

  listProducerRequests: presales.listProducerRequests,
  getRequestDetail: (requestId: string) => presales.getRequestDetail(requestId, "PRODUCER"),
  respondToRequest: presales.respondToRequest,
  declineRequest: presales.declineRequest,
  counterOffer: (requestId: string, raw: unknown) => presales.counterOffer(requestId, "PRODUCER", raw),
  acceptSaleQuote: (requestId: string, revision: unknown) => presales.acceptSaleQuote(requestId, revision, "PRODUCER"),
  rejectSaleQuote: (requestId: string, revision: unknown) => presales.rejectSaleQuote(requestId, revision, "PRODUCER"),
  withdrawNegotiation: (requestId: string) => presales.withdrawNegotiation(requestId, "PRODUCER"),

  listOpenRequestCatalog: presales.listOpenRequestCatalog,
  getOpenRequestForProducer: presales.getOpenRequestForProducer,
  startOpenRequestNegotiation: (openRequestId: string, raw: unknown) =>
    presales.startOpenRequestNegotiation(openRequestId, PRODUCER_PROFILE, raw),
};
