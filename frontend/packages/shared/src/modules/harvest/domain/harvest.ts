// PRD v3 RF-24 harvest, RF-21 custody balance and RF-27 investor panel, as the web app sees them. COP amounts in whole pesos.

export type ForeignAmount = { value: string; assetCode: string; assetScale: number };

export interface Harvest {
  status: string;
  declaredQuantityKg: number;
  declaredQuality: string;
  evidence: string;
  declaredAt: string;
  certifiedQuantityKg: number | null;
  certifiedQuality: string | null;
  certificationNotes: string | null;
  certifiedAt: string | null;
  price: { source: string; pricePerKg: number; exchangeFactor: string } | null;
  amountDue: number | null;
  currency: string;
  buyerId: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  receivedAt: string | null;
}

export interface HarvestEnvelope {
  projectId: string;
  projectCode: string;
  projectTitle: string;
  projectStatus: string;
  harvest: Harvest | null;
  paymentRedirectUrl: string | null;
}

export interface Custody {
  projectId: string;
  currency: string;
  /** Not clamped: negative when custody is overdrawn. */
  balance: number;
  overdrawn: boolean;
  credited: number;
  credits: { category: string; amount: number }[];
  /** Ledger DEBITs (the insurance premium, RF-14) by category. */
  debits: { category: string; amount: number }[];
  /** Everything that left custody: ledger debits + milestone lines + liquidation payouts; balance = credited − debited. */
  debited: number;
  ledgerDebits: number;
  milestoneDebits: number;
  settlementDebits: number;
}

export interface PanelPayout {
  id: string;
  status: string;
  amount: number;
  walletCurrency: string;
  reference: string | null;
  settledAt: string | null;
  receiveAmount: ForeignAmount | null;
  rate: string | null;
}

export interface PanelMilestone {
  id: string;
  title: string;
  sequenceOrder: number | null;
  status: string;
  grant: { status: string; cap: number; spent: number; remaining: number };
  lines: { id: string; kind: string; beneficiary: string; amount: number; status: string; reference: string | null; settledAt: string | null; outgoingPaymentId: string | null }[];
}

export interface PanelInvestment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  debit: ForeignAmount | null;
  receiveAmount: number | null;
  impliedRate: string | null;
  outgoingPaymentId: string | null;
  capturedAt: string | null;
  payouts: PanelPayout[];
}

export type Realized =
  | { status: "pending" }
  | {
      status: "settled";
      days: number;
      capital: number;
      returned: number;
      tirCopPct: number | null;
      investorCurrency: string;
      tirInvestorCurrencyPct: number | null;
      exitRateAssumed: boolean;
    };

export interface InvestorPanel {
  project: { id: string; projectCode: string; title: string; currentStatus: string; currency: string };
  capture: { targetAmount: number; raised: number; progressPct: number; investorsCount: number; byCurrency: { currency: string; debited: string; receivedCop: number }[] };
  custody: Custody;
  milestones: PanelMilestone[];
  investments: PanelInvestment[];
  realized: Realized;
  median: { tirCopPct: number; investorCurrency: string; exitRate: number | null; tirInvestorCurrencyPct: number | null } | null;
}

/** RF-24 forms. Raw values as the forms sent them; the use cases validate them. */
export type DeclareInput = { quantityKg: unknown; qualityGrade: unknown; evidence: unknown };
export type CertifyInput = { quantityKg: unknown; qualityGrade: unknown; notes: unknown; pricePerKg: unknown };

const pct = (value: number) => value.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
/** "14,5 %" or "—". */
export const pctText = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${pct(value)} %`);

/** Spent over cap as a 0..100 integer for a progress bar. */
export const spentPct = (grant: { cap: number; spent: number }) => (grant.cap > 0 ? Math.min(100, Math.round((grant.spent * 100) / grant.cap)) : 0);
