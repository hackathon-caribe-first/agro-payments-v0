import type { LedgerEntry } from "../domain/ledger";

// Port for the escrow ledger. Implementations throw BoundaryError or NetworkError.
export interface EscrowRepository {
  // Null when the project does not exist.
  listProjectLedger(projectId: string): Promise<LedgerEntry[] | null>;
}
