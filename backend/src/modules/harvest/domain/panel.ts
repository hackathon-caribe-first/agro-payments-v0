// RF-21 custody statement and RF-27 investor panel figures. Pure functions over other modules' aggregates (read only): no Nest, no I/O.
// Amounts are minor units of the project currency unless named otherwise; percentages are rounded to two decimals.
import type { Investment } from "../../investments/domain/investment";
import { type Milestone, spentFromCustody } from "../../milestones/application/milestone";
import type { Project } from "../../projects/application/project";
import { PAYOUT_STATUS, type Settlement, SETTLEMENT_STATUS } from "../../settlement/application/settlement";
import type { SimulationRun } from "../../simulation/application/simulation-run";

const pct2 = (fraction: number) => Math.round(fraction * 10_000) / 100;

// ---- RF-21: custody ----

export interface CustodyStatement {
  currency: string;
  assetScale: number;
  /** Every credit that reached custody: custody_balance (the ledger's net) plus the ledger debits it already lost. */
  credited: number;
  credits: { category: string; amount: number }[];
  /** Ledger DEBITs (the insurance premium, RF-14), already subtracted from custody_balance when they were booked. */
  ledgerDebits: number;
  debits: { category: string; amount: number }[];
  /** Milestone lines paid or in flight from custody. */
  milestoneDebits: number;
  /** Liquidation payouts paid or in flight from custody. */
  settlementDebits: number;
  /** What is still in custody; negative when more left custody than reached it (an overdraft, never hidden). */
  balance: number;
  overdrawn: boolean;
}

const MOVING: readonly string[] = [PAYOUT_STATUS.EXECUTED, PAYOUT_STATUS.EXECUTING];

/** The custody ledger grouped by category, in the project's minor units. */
export type LedgerTotals = { credits: Record<string, number>; debits: Record<string, number> };

const milestoneSpend = (milestones: readonly Milestone[]) => milestones.reduce((sum, m) => sum + spentFromCustody(m), 0);
const settlementSpend = (settlements: readonly Settlement[]) =>
  settlements.flatMap((s) => s.payouts).filter((p) => MOVING.includes(p.status)).reduce((sum, p) => sum + p.amount, 0);

/** RF-21: what custody still holds — custody_balance minus milestone lines and liquidation payouts paid or in flight. Not clamped. */
export const custodyAvailable = (project: Pick<Project, "custodyBalance">, milestones: readonly Milestone[], settlements: readonly Settlement[]) =>
  project.custodyBalance - milestoneSpend(milestones) - settlementSpend(settlements);

// Applies the custody rule documented on Project.custodyBalance: the premium is already out of custodyBalance, so the balance
// subtracts only what the ledger does not hold (milestone lines and liquidation payouts); credited adds the ledger debits back.
export function custodyStatement(
  project: Pick<Project, "currency" | "assetScale" | "custodyBalance">,
  ledger: LedgerTotals,
  milestones: readonly Milestone[],
  settlements: readonly Settlement[],
): CustodyStatement {
  const milestoneDebits = milestoneSpend(milestones);
  const settlementDebits = settlementSpend(settlements);
  const balance = custodyAvailable(project, milestones, settlements);
  const ledgerDebits = Object.values(ledger.debits).reduce((sum, amount) => sum + amount, 0);
  return {
    currency: project.currency,
    assetScale: project.assetScale,
    credited: project.custodyBalance + ledgerDebits,
    credits: Object.entries(ledger.credits).map(([category, amount]) => ({ category, amount })),
    ledgerDebits,
    debits: Object.entries(ledger.debits).map(([category, amount]) => ({ category, amount })),
    milestoneDebits,
    settlementDebits,
    balance,
    overdrawn: balance < 0,
  };
}

// ---- RF-27: each milestone's grant ----

export type GrantView = { status: "pending" | "active" | "revoked"; cap: number; spent: number; remaining: number };

// ponytail: read from the milestone (fundedAt / closedAt), not the grant store, so simulated mode (no grant rows) shows the same thing.
export function milestoneGrant(m: Milestone): GrantView {
  const spent = spentFromCustody(m);
  const status = m.fundedAt === null ? "pending" : m.closedAt !== null ? "revoked" : "active";
  return { status, cap: m.amount, spent, remaining: m.amount - spent };
}

// ---- RF-27 / A9: realized returns ----

export type Realized =
  | { status: "pending" }
  | {
      status: "settled";
      settlementId: string;
      days: number;
      /** k_i: COP that reached custody. */
      capital: number;
      /** X_i: COP debited from custody to this investor's wallet. */
      returned: number;
      tirCopPct: number | null;
      investorCurrency: string;
      tirInvestorCurrencyPct: number | null;
      /** True when the payout receipts carry no foreign amount and TRM_d = TRM_0 was assumed (simulated mode). */
      exitRateAssumed: boolean;
    };

/** A9: (multiple)^(365/d) − 1, in percent; null when it is undefined. */
export const annualizedPct = (multiple: number, days: number): number | null => (days > 0 && multiple > 0 ? pct2(multiple ** (365 / days) - 1) : null);

/** The investor's wallet currency: the debit side of their first captured quote. */
export const investorCurrencyOf = (mine: readonly Investment[]) => mine.find((i) => i.status === "CAPTURED")?.quote?.debitAssetCode ?? "COP";

export function realizedReturns(mine: readonly Investment[], settlements: readonly Settlement[]): Realized {
  const captured = mine.filter((i) => i.status === "CAPTURED");
  const settlement = settlements.filter((s) => s.status === SETTLEMENT_STATUS.EXECUTED).at(-1);
  const capital = captured.reduce((sum, i) => sum + i.amount, 0);
  if (!settlement || capital === 0) return { status: "pending" };

  const ids = new Set(captured.map((i) => `investor-${i.id}`));
  const payouts = settlement.payouts.filter((p) => ids.has(p.id) && p.status === PAYOUT_STATUS.EXECUTED);
  const returned = payouts.reduce((sum, p) => sum + p.amount, 0);
  const days = settlement.terms.days;
  const tirCopPct = annualizedPct(returned / capital, days);
  const currency = investorCurrencyOf(captured);
  if (currency === settlement.currency) {
    return { status: "settled", settlementId: settlement.id, days, capital, returned, tirCopPct, investorCurrency: currency, tirInvestorCurrencyPct: tirCopPct, exitRateAssumed: false };
  }
  // m_FX = X/K · TRM_0/TRM_d is exactly what the wallet received over what it paid, both in its own asset.
  const paid = captured.filter((i) => i.quote?.debitAssetCode === currency).reduce((sum, i) => sum + (i.quote?.debitAmount ?? 0), 0);
  const foreign = payouts.map((p) => p.receipt?.receiveAmount).filter((r) => r?.assetCode === currency);
  const known = paid > 0 && payouts.length > 0 && foreign.length === payouts.length;
  const received = foreign.reduce((sum, r) => sum + (r?.value ?? 0), 0);
  return {
    status: "settled",
    settlementId: settlement.id,
    days,
    capital,
    returned,
    tirCopPct,
    investorCurrency: currency,
    tirInvestorCurrencyPct: known ? annualizedPct(received / paid, days) : tirCopPct,
    exitRateAssumed: !known,
  };
}

// ---- RF-27: the simulated median ----

export type Median = {
  runId: string;
  createdAt: Date;
  tirCopPct: number;
  investorCurrency: string;
  entryRate: number | null;
  exitRate: number | null;
  tirInvestorCurrencyPct: number | null;
};

/** The latest run's median TIR in COP, and in the investor's currency at the exit rate equal to the entry rate (else the middle one). */
export function medianReturns(run: Pick<SimulationRun, "id" | "createdAt" | "sheet"> | null, currency: string): Median | null {
  if (!run) return null;
  const tirCopPct = run.sheet.monteCarlo.tirPct.median;
  const base = { runId: run.id, createdAt: run.createdAt, tirCopPct, investorCurrency: currency };
  if (currency === "COP") return { ...base, entryRate: 1, exitRate: 1, tirInvestorCurrencyPct: tirCopPct };
  const sheet = run.sheet.currencies.find((c) => c.currency === currency);
  const exit = sheet ? (sheet.exits.find((e) => e.exitRate === sheet.entryRate) ?? sheet.exits[Math.floor(sheet.exits.length / 2)]) : undefined;
  if (!sheet || !exit) return { ...base, entryRate: null, exitRate: null, tirInvestorCurrencyPct: null };
  return { ...base, entryRate: sheet.entryRate, exitRate: exit.exitRate, tirInvestorCurrencyPct: exit.tirPct.median };
}
