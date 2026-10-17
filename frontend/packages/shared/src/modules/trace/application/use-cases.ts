import { ok } from "../../milestones/domain/errors";
import { attemptOps } from "../../panel/domain/errors";
import { buildTrace } from "../domain/build-trace";
import { filterTrace, type TraceFilter, type TraceView } from "../domain/trace";
import { toPaymentStepsView, type PaymentStepsFilter, type PaymentStepsView } from "../domain/payment-steps";
import type { PaymentStepsRepository, TraceRepository } from "./trace-repository";

export interface TraceResult extends TraceView {
  // Entries after applying the filter (`entries` of the base view stay available through `total`).
  total: number;
}

// RF-20: the curl trace for support, filtered by project, milestone and step.
export const loadTrace = (repo: TraceRepository, filter: TraceFilter) =>
  attemptOps<TraceResult>(async () => {
    const sources = await repo.loadSources();
    const view = buildTrace(sources.grants, sources.settlements);
    return ok({ ...view, entries: filterTrace(view.entries, filter), total: view.entries.length });
  });

// RF-20 over the real backend: the payment-steps timeline, one card per payment, filtered by project and payment kind.
export const loadPaymentSteps = (repo: PaymentStepsRepository, filter: PaymentStepsFilter) =>
  attemptOps<PaymentStepsView>(async () => {
    // The project list is optional: when it fails the options fall back to the ids found in the rows.
    const [rows, projects] = await Promise.all([repo.listPaymentSteps(), repo.listProjects()]);
    return ok(toPaymentStepsView(rows, filter, projects));
  });
