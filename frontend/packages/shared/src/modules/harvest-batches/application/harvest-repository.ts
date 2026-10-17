import type { DeclarationContext, HarvestBatch, OrderDetail, PurchaseOrder, Settlement } from "../domain/harvest";
import type { CertifyHarvestInput } from "../schemas/certify-harvest";
import type { DeclareHarvestInput } from "../schemas/declare-harvest";
import type { DispatchOrderInput } from "../schemas/order-forms";

// Port. Implementations throw NetworkError / ValidationFailure / BoundaryError; use cases turn them into Results.
export interface HarvestRepository {
  // Producer
  getDeclarationContext(projectId: string): Promise<DeclarationContext | null>;
  declare(projectId: string, input: DeclareHarvestInput): Promise<HarvestBatch>;
  resubmit(batchId: string, input: DeclareHarvestInput): Promise<HarvestBatch>;
  // Verifier
  listBatches(filter: { status?: string; producerId?: string }): Promise<HarvestBatch[]>;
  getBatch(batchId: string): Promise<HarvestBatch | null>;
  certify(batchId: string, input: CertifyHarvestInput): Promise<HarvestBatch>;
  requestCorrections(batchId: string, comments: string): Promise<HarvestBatch>;
  // Marketplace
  listLots(productionType?: string): Promise<HarvestBatch[]>;
  getLot(batchId: string): Promise<HarvestBatch | null>;
  // Orders
  createOrder(batchId: string, buyerId: string, quantityKg: number): Promise<PurchaseOrder>;
  listOrders(filter: { buyerId?: string; producerId?: string }): Promise<PurchaseOrder[]>;
  getOrderDetail(orderId: string): Promise<OrderDetail | null>;
  authorizePayment(orderId: string, buyerId: string, expectedTotal: number): Promise<OrderDetail>;
  revokeAuthorization(orderId: string, buyerId: string): Promise<OrderDetail>;
  cancelOrder(orderId: string, buyerId: string): Promise<OrderDetail>;
  dispatch(orderId: string, input: DispatchOrderInput): Promise<OrderDetail>;
  confirmReception(orderId: string, buyerId: string): Promise<OrderDetail>;
  // Settlements
  listSettlements(projectId: string): Promise<Settlement[]>;
  listAllSettlements(): Promise<Settlement[]>;
}
