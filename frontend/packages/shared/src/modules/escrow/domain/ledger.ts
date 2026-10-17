// Domain types for the escrow ledger (the custody account of a project): buyer deposits, investor capital, the harvest payment
// (RF-24), the insurance premium paid from custody (DEBIT, RF-14) and the indemnity paid into it (RF-25).

export const LEDGER_TYPES = ["CREDIT", "DEBIT"] as const;
export const LEDGER_CATEGORIES = ["BUYER_DEPOSIT", "INVESTOR_CAPITAL", "HARVEST_PAYMENT", "PREMIUM", "INDEMNITY"] as const;
// A project agreement is first PENDING (agreed, not yet deposited) and then DEPOSITED.
export const DEPOSIT_STATUSES = ["PENDING", "DEPOSITED"] as const;

// Values added by a newer server map to "UNKNOWN" so they degrade instead of crashing.
export type LedgerType = (typeof LEDGER_TYPES)[number] | "UNKNOWN";
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number] | "UNKNOWN";
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number] | "UNKNOWN";

export interface LedgerEntry {
  id: string;
  projectId: string;
  type: LedgerType;
  category: LedgerCategory;
  amount: number;
  currency: string;
  // "" on investor capital entries.
  negotiationId: string;
  buyerId: string;
  createdAt: string;
}

// Custody is the credits minus the debits; entries of an unknown type never count.
export const custodyBalance = (entries: readonly Pick<LedgerEntry, "type" | "amount">[]): number =>
  entries.reduce((sum, e) => sum + (e.type === "CREDIT" ? e.amount : e.type === "DEBIT" ? -e.amount : 0), 0);
