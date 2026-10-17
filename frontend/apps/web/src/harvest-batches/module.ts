import { createHarvestModule } from "@agro/shared/modules/harvest-batches/infrastructure/harvest-module";
import { INVESTOR_IDENTITY, VERIFIER_IDENTITY } from "@agro/shared/modules/presales/infrastructure/mock/identities";
import { BUYER_PROFILE } from "~/buyer/module";
import { PRODUCER_PROFILE } from "~/producer/presales";
import { API_BASE_URL, prototypeTransport } from "~/platform/transport";

// Composition root of the harvest / marketplace / orders / liquidation area.
//
// INTEGRATION: `transport` (~/platform/transport -> createAppMockTransport) must chain `createHarvestMockFetch`
// (@agro/shared/modules/harvest-batches/infrastructure/mock/mock-fetch) around the other handlers. See routes/harvest.integration.md.

// There is no authentication yet: the verifier and the investor are fixed profiles.
export const VERIFIER_PROFILE = { id: VERIFIER_IDENTITY.id, name: VERIFIER_IDENTITY.label } as const;
export const INVESTOR_PROFILE = { id: INVESTOR_IDENTITY.id, name: INVESTOR_IDENTITY.name } as const;

const harvest = createHarvestModule({ fetchFn: prototypeTransport, baseUrl: API_BASE_URL });

// Producer: declare the harvest, dispatch orders, read the final statement.
export const producerHarvest = {
  getDeclarationContext: harvest.getDeclarationContext,
  declare: harvest.declareHarvest,
  resubmit: harvest.resubmitHarvest,
  listOrders: () => harvest.listProducerOrders(PRODUCER_PROFILE.id),
  getOrderDetail: harvest.getOrderDetail,
  dispatch: harvest.dispatchOrder,
  listSettlements: harvest.listProjectSettlements,
};

// Verifier: certification queue and opinion.
export const verifierHarvest = {
  listQueue: harvest.listVerifierBatches,
  getBatch: harvest.getBatch,
  certify: harvest.certifyHarvest,
  requestCorrections: harvest.requestHarvestCorrections,
};

// Final buyer: marketplace, orders, payment authorization, reception.
export const buyerHarvest = {
  listLots: harvest.listLots,
  getLot: harvest.getLot,
  createOrder: (batchId: string, raw: unknown) => harvest.createPurchaseOrder(batchId, BUYER_PROFILE.id, raw),
  listOrders: () => harvest.listBuyerOrders(BUYER_PROFILE.id),
  getOrderDetail: harvest.getOrderDetail,
  authorize: (orderId: string, raw: unknown) => harvest.authorizeOrderPayment(orderId, BUYER_PROFILE.id, raw),
  revokeAuthorization: (orderId: string) => harvest.revokeOrderAuthorization(orderId, BUYER_PROFILE.id),
  cancel: (orderId: string) => harvest.cancelOrder(orderId, BUYER_PROFILE.id),
  confirmReception: (orderId: string) => harvest.confirmOrderReception(orderId, BUYER_PROFILE.id),
};

// Investor: read-only balance of the liquidation.
export const investorHarvest = {
  listSettlements: harvest.listAllSettlements,
  listProjectSettlements: harvest.listProjectSettlements,
};
