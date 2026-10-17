// Domain → /api wire shapes for suppliers and orders. Pesos stay whole COP, as the assistant recorded them.
import type { OrderIntent } from "../../assistant/application/order-intents";
import type { Supplier } from "../application/supplier";

export const toSupplierResponse = (s: Supplier) => ({
  id: s.id,
  name: s.name,
  wallet_address: s.walletAddress,
  asset_code: s.assetCode,
  asset_scale: s.assetScale,
  created_at: s.createdAt.toISOString(),
});

export const toOrderResponse = (o: OrderIntent) => ({
  id: o.id,
  milestone_id: o.milestoneId,
  supplier: o.supplier,
  product: o.product,
  quantity: o.quantity,
  unit: o.unit,
  unit_price: o.unitPrice,
  total: o.total,
  requested_by: o.requestedBy,
  confirmed_at: o.confirmedAt?.toISOString() ?? null,
  approval: o.approval,
  line_id: o.lineId,
  reason: o.reason,
  decided_by: o.decidedBy,
  decided_at: o.decidedAt?.toISOString() ?? null,
});
