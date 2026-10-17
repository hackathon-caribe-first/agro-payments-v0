import { loadReconciliation, reviewReconciliationEntry } from "../application/use-cases";
import { HttpReconciliationRepository } from "./http-reconciliation-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the reconciliation module: binds every use case to one repository over the given transport.
export function createReconciliationModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpReconciliationRepository({ baseUrl, fetchFn });
  return {
    load: () => loadReconciliation(repo),
    review: (entryId: string, raw: unknown) => reviewReconciliationEntry(repo, entryId, raw),
  };
}

export type ReconciliationModule = ReturnType<typeof createReconciliationModule>;
