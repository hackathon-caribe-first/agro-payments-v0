import type { TraceFilter } from "../domain/trace";
import { loadTrace } from "../application/use-cases";
import { HttpTraceRepository } from "./http-trace-repository";

interface Options {
  fetchFn: typeof fetch;
  investorIds: readonly string[];
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the trace view: binds the use case to one repository over the given transport.
export function createTraceModule({ fetchFn, investorIds, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpTraceRepository({ baseUrl, fetchFn, investorIds });
  return {
    loadTrace: (filter: TraceFilter) => loadTrace(repo, filter),
  };
}

export type TraceModule = ReturnType<typeof createTraceModule>;
