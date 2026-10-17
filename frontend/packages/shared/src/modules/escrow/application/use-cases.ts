import { err, ok } from "../../milestones/domain/errors";
import { attempt } from "../../milestones/application/use-cases";
import { custodyBalance, type LedgerEntry } from "../domain/ledger";
import type { EscrowRepository } from "./escrow-repository";

export interface ProjectLedger {
  // Newest first.
  entries: LedgerEntry[];
  balance: number;
}

export const getProjectLedger = (repo: EscrowRepository, projectId: string) =>
  attempt<ProjectLedger>(async () => {
    const entries = await repo.listProjectLedger(projectId);
    if (!entries) return err({ kind: "not_found" });
    const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok({ entries: sorted, balance: custodyBalance(sorted) });
  });
