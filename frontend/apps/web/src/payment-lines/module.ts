import { createPaymentLinesModule } from "@agro/shared/modules/payment-lines/infrastructure/payment-lines-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// INTEGRATION: ~/platform/transport.ts (createAppMockTransport) must chain createPaymentLinesMockFetch(store, delegate)
// from @agro/shared/modules/payment-lines/infrastructure/mock/mock-fetch. See routes/split.integration.md.
const paymentLines = createPaymentLinesModule({ fetchFn: transport, baseUrl: API_BASE_URL });

// Supplier-side: the payments addressed to the signed-in supplier ("Mis cobros").
export const supplierLines = {
  listMyPayments: (supplierId: string) => paymentLines.listSupplierPayments(supplierId),
};

// Producer-side payment lines: suppliers registry and the split of each milestone.
export const producerLines = {
  listSuppliers: paymentLines.listSuppliers,
  createSupplier: paymentLines.createSupplier,
  getMilestoneLines: paymentLines.getMilestoneLines,
  addLine: paymentLines.addLine,
  updateLine: paymentLines.updateLine,
  removeLine: paymentLines.removeLine,
  // RF-21: funds from the contingency reserve; RF-11: "Reintentar pago".
  requestContingencyFunds: paymentLines.requestContingencyFunds,
  retryLinePayment: paymentLines.retryLinePayment,
  getProjectLines: paymentLines.getProjectLines,
  // For the payment flows (verifier approval, supplier payments): the line was paid.
  markLinePaid: paymentLines.markLinePaid,
  getPrdExample: paymentLines.getPrdExample,
};

// Read-only, for every role: the payments of a milestone still pending a retry (banner on producer, investor and verifier pages).
export const milestonePayments = {
  getPendingRetry: paymentLines.getPendingRetry,
  getProjectPendingRetry: paymentLines.getProjectPendingRetry,
};
