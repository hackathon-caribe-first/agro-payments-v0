import { err, ok } from "../../milestones/domain/errors";
import { toFieldErrors } from "../../milestones/schemas/evidence-log";
import { attemptOps } from "../../panel/domain/errors";
import { REVIEW_ACTOR, groupByBeneficiary, summarize, type BeneficiaryGroup, type ReconciliationEntry, type ReconciliationSummary } from "../domain/reconciliation";
import { reviewNoteSchema } from "../schemas/review-note";
import type { ReconciliationRepository } from "./reconciliation-repository";

export interface ReconciliationView {
  entries: ReconciliationEntry[];
  summary: ReconciliationSummary;
  groups: BeneficiaryGroup[];
}

// RF-17: every incoming payment against the platform receipts, grouped by beneficiary, with the success metric.
export const loadReconciliation = (repo: ReconciliationRepository) =>
  attemptOps<ReconciliationView>(async () => {
    const entries = await repo.listEntries();
    return ok({ entries, summary: summarize(entries), groups: groupByBeneficiary(entries) });
  });

// "Conciliar": marks the row as reviewed with a note. Append-only, never edits previous notes.
export const reviewReconciliationEntry = (repo: ReconciliationRepository, entryId: string, raw: unknown) =>
  attemptOps<ReconciliationEntry>(async () => {
    const parsed = reviewNoteSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    const entry = await repo.reviewEntry(entryId, parsed.data.note, REVIEW_ACTOR);
    if (!entry) return err({ kind: "not_found" });
    return ok(entry);
  });
