import type { LedgerEntryDto } from "../../../escrow/infrastructure/dto";
import type { MilestoneDetailDto } from "../../../milestones/infrastructure/dto";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import type { HistoryEntryDto, QuoteRequestDto } from "../dto";

// The slice of the mock store the deposit touches. These are the SAME arrays every handler in the transport chain reads:
// they are only ever mutated in place, never reassigned.
export interface DepositStore {
  projects: ProjectDto[];
  externalProjects: ProjectDto[];
  milestones: MilestoneDetailDto[];
  ledgerEntries: LedgerEntryDto[];
}

interface DepositIds {
  ledgerId: string;
  historyId: string;
  at: string;
}

// Executes the deposit of an agreed PROJECT negotiation. Synchronous on purpose: every guard has already passed, so the
// whole effect (negotiation, ledger, custody, project status, first milestone) lands together or not at all.
export function applyProjectDeposit(store: DepositStore, request: QuoteRequestDto, { ledgerId, historyId, at }: DepositIds): void {
  const total = request.agreed_total ?? 0;
  const project = [...store.projects, ...store.externalProjects].find((p) => p.id === request.project_id);
  if (!project) throw new Error(`Project ${request.project_id} not found`);

  request.deposit_status = "DEPOSITED";
  request.deposited_at = at;
  request.ledger_entry_id = ledgerId;
  const entry: HistoryEntryDto = {
    id: historyId,
    actor: "BUYER",
    type: "DEPOSIT",
    from: request.status,
    to: request.status,
    at,
    payload: { amount: total, currency: "COP", ledger_entry_id: ledgerId },
  };
  request.history.push(entry);

  store.ledgerEntries.push({
    id: ledgerId,
    project_id: project.id,
    type: "CREDIT",
    category: "BUYER_DEPOSIT",
    amount: total,
    currency: "COP",
    negotiation_id: request.id,
    buyer_id: request.buyer_id,
    created_at: at,
  });

  // The full agreed total goes into custody, whatever the account already held.
  project.custody_balance += total;
  project.current_status = "FUNDED_IN_CUSTODY";

  // The first milestone is released; every other milestone stays as it is.
  const first = store.milestones.find((m) => m.project_id === project.id && m.sequence_order === 1);
  if (first && first.status === "LOCKED") first.status = "ACTIVE";
}
