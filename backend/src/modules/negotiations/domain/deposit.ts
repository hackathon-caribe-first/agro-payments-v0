// Ported from frontend/packages/shared/src/modules/presales/infrastructure/mock/deposit.ts. The custody side (balance, project
// status) is NegotiationStore.creditCustody; the first milestone opens because milestones stay LOCKED until the project is
// FUNDED_IN_CUSTODY (see milestone-progress.ts), so nothing is written on the milestone itself.
import type { HistoryEntryDto, LedgerEntryDto, QuoteRequestDto } from "./wire";

interface DepositIds {
  ledgerId: string;
  historyId: string;
  at: string;
}

/** Marks the agreed PROJECT negotiation DEPOSITED, appends the DEPOSIT event and returns the custody CREDIT. Every guard ran before. */
export function applyProjectDeposit(request: QuoteRequestDto, { ledgerId, historyId, at }: DepositIds): LedgerEntryDto {
  const total = request.agreed_total ?? 0;
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
  return {
    id: ledgerId,
    project_id: request.project_id,
    type: "CREDIT",
    category: "BUYER_DEPOSIT",
    amount: total,
    currency: "COP",
    negotiation_id: request.id,
    buyer_id: request.buyer_id,
    created_at: at,
  };
}
