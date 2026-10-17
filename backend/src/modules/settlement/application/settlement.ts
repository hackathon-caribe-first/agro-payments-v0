// A project's liquidation (RF-26): the cascade plan snapshot plus one payout per beneficiary, and its lifecycle
// draft → approved (operator or fiduciaria) → executing → executed | failed. Pure functions: no Nest, no I/O.

import { DomainError } from "../../../shared/domain-errors";
import { type LineReceipt, type LineResult, mergeReceipt } from "../../milestones/application/milestone";
import { BENEFICIARY_KIND, type Beneficiary, computeLiquidation, type LiquidationPlan, PREFERRED_RATE_BPS } from "./liquidation";

export const SETTLEMENT_STATUS = { DRAFT: "draft", APPROVED: "approved", EXECUTING: "executing", EXECUTED: "executed", FAILED: "failed" } as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUS)[keyof typeof SETTLEMENT_STATUS];

export const PAYOUT_STATUS = { PENDING: "pending", EXECUTING: "executing", EXECUTED: "executed", FAILED: "failed" } as const;
export type PayoutStatus = (typeof PAYOUT_STATUS)[keyof typeof PAYOUT_STATUS];

/** A settlement that holds or moved money: a project has at most one, drafts and failed ones aside. */
export const ACTIVE_STATUSES: readonly SettlementStatus[] = [SETTLEMENT_STATUS.APPROVED, SETTLEMENT_STATUS.EXECUTING, SETTLEMENT_STATUS.EXECUTED];

export interface InvestorPosition {
  id: string;
  /** k_i in the project currency's minor units (COP), as it reached custody. */
  capital: number;
  /** Asset of the investor's wallet; anything but the project currency is paid with a fixed COP debit (RF-26). */
  currency: string;
  walletAddress: string;
}

/** What the cascade is computed from, in minor units of the project currency. */
export interface SettlementTerms {
  proceeds: number;
  integratorDebt: number;
  integratorWalletAddress: string | null;
  producerContribution: number;
  days: number;
  investors: InvestorPosition[];
}

export interface PartyWallets {
  producer: string;
  platform: string;
}

export interface Payout {
  /** `integrator`, `producer`, `platform` or `investor-<id>`; with the settlement id it is the gateway idempotency key. */
  id: string;
  beneficiary: Beneficiary;
  walletAddress: string;
  walletCurrency: string;
  /** Minor units of the settlement currency: the debit from custody. */
  amount: number;
  /** Foreign-currency wallet: the custody debit is fixed and the receiver absorbs fees and FX (PRD v3 Riesgos). */
  fixedDebitAmount: boolean;
  status: PayoutStatus;
  reference: string | null;
  settledAt: Date | null;
  receipt: LineReceipt | null;
}

export interface Settlement {
  id: string;
  projectId: string;
  status: SettlementStatus;
  currency: string;
  assetScale: number;
  preferredRateBps: number;
  terms: SettlementTerms;
  plan: LiquidationPlan;
  payouts: Payout[];
  createdBy: string;
  createdAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  /** When the last payout was executed. */
  executedAt: Date | null;
}

const payoutId = (b: Beneficiary) => (b.kind === BENEFICIARY_KIND.INVESTOR ? `investor-${b.id}` : b.kind);

export function planPayouts(terms: SettlementTerms, wallets: PartyWallets, currency: string): { plan: LiquidationPlan; payouts: Payout[] } {
  if (terms.integratorDebt > 0 && !terms.integratorWalletAddress) throw new DomainError("An integrator debt needs the integrator's wallet");
  const plan = computeLiquidation({
    proceeds: terms.proceeds,
    integratorDebt: terms.integratorDebt,
    investors: terms.investors.map(({ id, capital }) => ({ id, capital })),
    producerContribution: terms.producerContribution,
    days: terms.days,
  });
  const investors = new Map(terms.investors.map((i) => [i.id, i]));
  const walletOf = (b: Beneficiary): { walletAddress: string; walletCurrency: string } => {
    switch (b.kind) {
      case BENEFICIARY_KIND.INVESTOR: {
        const investor = investors.get(b.id);
        if (!investor) throw new Error(`Unknown investor ${b.id}`);
        return { walletAddress: investor.walletAddress, walletCurrency: investor.currency };
      }
      case BENEFICIARY_KIND.INTEGRATOR:
        return { walletAddress: terms.integratorWalletAddress ?? "", walletCurrency: currency };
      case BENEFICIARY_KIND.PRODUCER:
        return { walletAddress: wallets.producer, walletCurrency: currency };
      case BENEFICIARY_KIND.PLATFORM:
        return { walletAddress: wallets.platform, walletCurrency: currency };
    }
  };
  // ponytail: no non-resident withholding (RF-31, "Siguiente") and no netting when the buyer is also an investor (RF-26 optional).
  const payouts = plan.totals
    .filter((t) => t.amount > 0)
    .map(({ beneficiary, amount }): Payout => {
      const wallet = walletOf(beneficiary);
      return {
        id: payoutId(beneficiary),
        beneficiary,
        ...wallet,
        amount,
        fixedDebitAmount: wallet.walletCurrency !== currency,
        status: PAYOUT_STATUS.PENDING,
        reference: null,
        settledAt: null,
        receipt: null,
      };
    });
  return { plan, payouts };
}

type NewSettlement = { id: string; projectId: string; terms: SettlementTerms; wallets: PartyWallets; currency: string; assetScale: number; createdBy: string; now: Date };

export function createSettlement({ id, projectId, terms, wallets, currency, assetScale, createdBy, now }: NewSettlement): Settlement {
  const { plan, payouts } = planPayouts(terms, wallets, currency);
  // A settlement with no payout could never close; a zero liquidation is only previewed.
  if (payouts.length === 0) throw new DomainError("Nothing to liquidate: the proceeds are zero");
  return {
    id,
    projectId,
    status: SETTLEMENT_STATUS.DRAFT,
    currency,
    assetScale,
    preferredRateBps: PREFERRED_RATE_BPS,
    terms,
    plan,
    payouts,
    createdBy,
    createdAt: now,
    approvedBy: null,
    approvedAt: null,
    executedAt: null,
  };
}

export function approveSettlement(s: Settlement, by: string, now: Date): Settlement {
  if (s.status !== SETTLEMENT_STATUS.DRAFT) throw new DomainError(`Settlement ${s.id} is ${s.status}; only a draft can be approved`);
  return { ...s, status: SETTLEMENT_STATUS.APPROVED, approvedBy: by, approvedAt: now };
}

/** approved → executing; an executing settlement stays so, and executing it again pays what is pending and syncs what is in flight. */
export function startExecution(s: Settlement): Settlement {
  if (s.status === SETTLEMENT_STATUS.EXECUTING) return s;
  if (s.status !== SETTLEMENT_STATUS.APPROVED) throw new DomainError(`Settlement ${s.id} is ${s.status}; only an approved settlement can be executed`);
  return { ...s, status: SETTLEMENT_STATUS.EXECUTING };
}

const PAYOUT_FROM_LINE: Record<LineResult["status"], PayoutStatus> = {
  en_cola: PAYOUT_STATUS.EXECUTING,
  completado: PAYOUT_STATUS.EXECUTED,
  fallido: PAYOUT_STATUS.FAILED,
};

const isFinal = (p: Payout) => p.status === PAYOUT_STATUS.EXECUTED || p.status === PAYOUT_STATUS.FAILED;

/** A gateway answer (same shape as a milestone line's) applied to one payout; the settlement closes when every payout is final. */
export function applyPayoutResult(s: Settlement, id: string, result: LineResult, now: Date): Settlement {
  const payout = s.payouts.find((p) => p.id === id);
  if (!payout) throw new DomainError(`Settlement ${s.id} has no payout ${id}`);
  if (isFinal(payout)) throw new DomainError(`Payout ${id} is already ${payout.status}`);
  const status = PAYOUT_FROM_LINE[result.status];
  const updated: Payout = {
    ...payout,
    status,
    reference: result.reference ?? payout.reference,
    settledAt: status === PAYOUT_STATUS.EXECUTED ? now : null,
    receipt: mergeReceipt(payout.receipt, result.receipt),
  };
  const payouts = s.payouts.map((p) => (p.id === id ? updated : p));
  if (!payouts.every(isFinal)) return { ...s, payouts };
  // ponytail: a failed payout leaves its money in custody and the settlement failed; retrying it is not built yet.
  const allExecuted = payouts.every((p) => p.status === PAYOUT_STATUS.EXECUTED);
  return { ...s, payouts, status: allExecuted ? SETTLEMENT_STATUS.EXECUTED : SETTLEMENT_STATUS.FAILED, executedAt: allExecuted ? now : null };
}

/**
 * What an investor may read of a settlement: their own positions, allocations and payouts; other investors' wallets and amounts are
 * omitted (the tier claims, paid amounts and investorsTotal stay as aggregates). Producer, platform and integrator entries remain.
 */
export function onlyInvestorsOwn(s: Settlement, ownInvestmentIds: ReadonlySet<string>): Settlement {
  const visible = (b: Beneficiary) => b.kind !== BENEFICIARY_KIND.INVESTOR || ownInvestmentIds.has(b.id);
  return {
    ...s,
    terms: { ...s.terms, investors: s.terms.investors.filter((i) => ownInvestmentIds.has(i.id)) },
    plan: {
      ...s.plan,
      tiers: s.plan.tiers.map((t) => ({ ...t, allocations: t.allocations.filter((a) => visible(a.beneficiary)) })),
      totals: s.plan.totals.filter((a) => visible(a.beneficiary)),
    },
    payouts: s.payouts.filter((p) => visible(p.beneficiary)),
  };
}
