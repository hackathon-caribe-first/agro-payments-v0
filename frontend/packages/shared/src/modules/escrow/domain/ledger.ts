// Domain types for the escrow ledger (the custody account of a project): buyer deposits and investor capital.

export const LEDGER_TYPES = ["CREDIT"] as const;
export const LEDGER_CATEGORIES = ["BUYER_DEPOSIT", "INVESTOR_CAPITAL", "HARVEST_PAYMENT"] as const;
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

// Custody is the sum of the credits; entries of an unknown type never count.
export const custodyBalance = (entries: readonly Pick<LedgerEntry, "type" | "amount">[]): number =>
  entries.filter((e) => e.type === "CREDIT").reduce((sum, e) => sum + e.amount, 0);
