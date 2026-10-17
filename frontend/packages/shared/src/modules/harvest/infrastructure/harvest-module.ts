import {
  authorizeOrderPayment,
  cancelOrder,
  certifyHarvest,
  confirmOrderReception,
  createPurchaseOrder,
  declareHarvest,
  dispatchOrder,
  getBatch,
  getDeclarationContext,
  getLot,
  getOrderDetail,
  listAllSettlements,
  listBuyerOrders,
  listLots,
  listProducerOrders,
  listProjectSettlements,
  listVerifierBatches,
  requestHarvestCorrections,
  resubmitHarvest,
  revokeOrderAuthorization,
  type HarvestDeps,
} from "../application/use-cases";
import { HttpHarvestRepository } from "./http-harvest-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Binds every harvest use case to one repository over the given transport. Identity (producer / buyer / verifier) is
// applied by the app-level composition roots, which wrap these functions.
export function createHarvestModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const deps: HarvestDeps = { harvest: new HttpHarvestRepository({ baseUrl, fetchFn }) };
  return {
    getDeclarationContext: (projectId: string) => getDeclarationContext(deps, projectId),
    declareHarvest: (projectId: string, raw: unknown) => declareHarvest(deps, projectId, raw),
    resubmitHarvest: (batchId: string, raw: unknown) => resubmitHarvest(deps, batchId, raw),
    listVerifierBatches: () => listVerifierBatches(deps),
    getBatch: (batchId: string) => getBatch(deps, batchId),
    certifyHarvest: (batchId: string, raw: unknown) => certifyHarvest(deps, batchId, raw),
    requestHarvestCorrections: (batchId: string, raw: unknown) => requestHarvestCorrections(deps, batchId, raw),
    listLots: (productionType?: string) => listLots(deps, productionType),
    getLot: (batchId: string) => getLot(deps, batchId),
    createPurchaseOrder: (batchId: string, buyerId: string, raw: unknown) => createPurchaseOrder(deps, batchId, buyerId, raw),
    listBuyerOrders: (buyerId: string) => listBuyerOrders(deps, buyerId),
    listProducerOrders: (producerId: string) => listProducerOrders(deps, producerId),
    getOrderDetail: (orderId: string) => getOrderDetail(deps, orderId),
    authorizeOrderPayment: (orderId: string, buyerId: string, raw: unknown) => authorizeOrderPayment(deps, orderId, buyerId, raw),
    revokeOrderAuthorization: (orderId: string, buyerId: string) => revokeOrderAuthorization(deps, orderId, buyerId),
    cancelOrder: (orderId: string, buyerId: string) => cancelOrder(deps, orderId, buyerId),
    dispatchOrder: (orderId: string, raw: unknown) => dispatchOrder(deps, orderId, raw),
    confirmOrderReception: (orderId: string, buyerId: string) => confirmOrderReception(deps, orderId, buyerId),
    listProjectSettlements: (projectId: string) => listProjectSettlements(deps, projectId),
    listAllSettlements: () => listAllSettlements(deps),
  };
}

export type HarvestModule = ReturnType<typeof createHarvestModule>;
