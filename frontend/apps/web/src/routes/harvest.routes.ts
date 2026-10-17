import { route, type RouteConfigEntry } from "@react-router/dev/routes";

// Harvest, marketplace, orders and liquidation. Static paths come before dynamic ones.
export const harvestRoutes: RouteConfigEntry[] = [
  route("producer/orders", "routes/harvest.producer-orders.tsx"),
  route("producer/orders/:orderId", "routes/harvest.producer-order.tsx"),
  route("producer/projects/:projectId/harvest", "routes/harvest.producer-declare.tsx"),
  route("producer/projects/:projectId/settlement", "routes/harvest.producer-settlement.tsx"),
  route("verifier/harvests", "routes/harvest.verifier-batches.tsx"),
  route("verifier/harvests/:batchId", "routes/harvest.verifier-batch.tsx"),
  route("buyer/marketplace", "routes/harvest.marketplace.tsx"),
  route("buyer/marketplace/:batchId", "routes/harvest.lot.tsx"),
  route("buyer/orders", "routes/harvest.buyer-orders.tsx"),
  route("buyer/orders/:orderId", "routes/harvest.buyer-order.tsx"),
  route("buyer/orders/:orderId/authorize", "routes/harvest.buyer-order-authorize.tsx"),
  route("investor/settlements", "routes/harvest.investor-settlements.tsx"),
  route("investor/settlements/:projectId", "routes/harvest.investor-settlement.tsx"),
];
