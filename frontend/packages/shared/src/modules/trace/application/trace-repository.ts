import type { GrantDetail } from "../../grants/domain/grant";
import type { Settlement } from "../../harvest-batches/domain/harvest";
import type { PaymentStepRow, ProjectOption } from "../domain/payment-steps";

export interface TraceSources {
  grants: GrantDetail[];
  settlements: Settlement[];
}

// Port of the data the trace is derived from. It only reads.
export interface TraceRepository {
  loadSources(): Promise<TraceSources>;
}

// Port of the real payment-steps log (GET /support/payment-steps). It only reads; rows come back already validated.
export interface PaymentStepsRepository {
  listPaymentSteps(): Promise<PaymentStepRow[]>;
  // Every project (GET /projects, admin and fidu) for the filter labels; null when it cannot be read, never a failure.
  listProjects(): Promise<ProjectOption[] | null>;
}
