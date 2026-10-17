import {
  addLine,
  createSupplier,
  getMilestoneLines,
  getPendingRetry,
  getProjectPendingRetry,
  getPrdExample,
  getProjectLines,
  listSuppliers,
  listSupplierPayments,
  markLinePaid,
  removeLine,
  requestContingencyFunds,
  retryLinePayment,
  updateLine,
  type PaymentLinesDeps,
} from "../application/use-cases";
import { HttpPaymentLinesRepository } from "./http-payment-lines-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Binds every payment-lines use case to one repository over the given transport.
export function createPaymentLinesModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const deps: PaymentLinesDeps = { lines: new HttpPaymentLinesRepository({ baseUrl, fetchFn }) };

  return {
    listSuppliers: () => listSuppliers(deps),
    listSupplierPayments: (supplierId: string) => listSupplierPayments(deps, supplierId),
    createSupplier: (raw: unknown) => createSupplier(deps, raw),
    getMilestoneLines: (milestoneId: string) => getMilestoneLines(deps, milestoneId),
    addLine: (milestoneId: string, raw: unknown) => addLine(deps, milestoneId, raw),
    updateLine: (milestoneId: string, lineId: string, raw: unknown) => updateLine(deps, milestoneId, lineId, raw),
    removeLine: (milestoneId: string, lineId: string) => removeLine(deps, milestoneId, lineId),
    markLinePaid: (lineId: string) => markLinePaid(deps, lineId),
    requestContingencyFunds: (milestoneId: string, raw: unknown) => requestContingencyFunds(deps, milestoneId, raw),
    retryLinePayment: (milestoneId: string, lineId: string) => retryLinePayment(deps, milestoneId, lineId),
    getPendingRetry: (milestoneId: string) => getPendingRetry(deps, milestoneId),
    getProjectPendingRetry: (projectId: string) => getProjectPendingRetry(deps, projectId),
    getProjectLines: (projectId: string) => getProjectLines(deps, projectId),
    getPrdExample,
  };
}

export type PaymentLinesModule = ReturnType<typeof createPaymentLinesModule>;
