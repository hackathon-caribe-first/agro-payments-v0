import type { ReconciliationEntry } from "../domain/reconciliation";

// Port of the reconciliation backend. Rejections (400) surface as ValidationFailure from the infrastructure.
export interface ReconciliationRepository {
  listEntries(): Promise<ReconciliationEntry[]>;
  // Append-only: every call adds one review note to the row.
  reviewEntry(entryId: string, note: string, actor: string): Promise<ReconciliationEntry | null>;
}
