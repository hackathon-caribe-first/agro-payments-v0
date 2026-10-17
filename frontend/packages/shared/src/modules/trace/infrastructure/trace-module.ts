import type { PaymentStepsFilter } from "../domain/payment-steps";
import type { TraceFilter } from "../domain/trace";
import { loadPaymentSteps, loadTrace } from "../application/use-cases";
import { HttpPaymentStepsRepository } from "./http-payment-steps-repository";
import { HttpTraceRepository } from "./http-trace-repository";

interface Options {
  fetchFn: typeof fetch;
  investorIds: readonly string[];
  baseUrl?: string;
  // Transport of the real payment-steps log; defaults to `fetchFn`.
  paymentStepsFetchFn?: typeof fetch;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the trace view: the derived curl trace and the real payment-steps timeline, each over its transport.
export function createTraceModule({ fetchFn, investorIds, baseUrl = DEFAULT_BASE_URL, paymentStepsFetchFn = fetchFn }: Options) {
  const repo = new HttpTraceRepository({ baseUrl, fetchFn, investorIds });
  const stepsRepo = new HttpPaymentStepsRepository({ baseUrl, fetchFn: paymentStepsFetchFn });
  return {
    loadTrace: (filter: TraceFilter) => loadTrace(repo, filter),
    loadPaymentSteps: (filter: PaymentStepsFilter) => loadPaymentSteps(stepsRepo, filter),
  };
}

export type TraceModule = ReturnType<typeof createTraceModule>;
