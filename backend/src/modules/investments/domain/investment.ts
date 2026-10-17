// Investor capture (PRD v3 Fase 1, RF-10, RF-29): an investor moves a COP contribution from their own wallet, in whatever
// currency it holds, into the project's custody. Pure rules: no Nest, no I/O. Amounts are integer minor units; rates are
// exact reduced ratios computed in BigInt (RNF-10), never floats.
import { DomainError } from "../../../shared/domain-errors";
import { PROJECT_STATUS, type Project, type ProjectStatus } from "../../projects/application/project";

export const INVESTMENT_STATUS = { PENDING_CONSENT: "PENDING_CONSENT", CAPTURED: "CAPTURED", FAILED: "FAILED" } as const;
export type InvestmentStatus = (typeof INVESTMENT_STATUS)[keyof typeof INVESTMENT_STATUS];

/** The quote the money moved (or will move) with: receive side fixed in COP, debit side in the investor's wallet asset. */
export interface CaptureQuote {
  id: string;
  /** Minor units of debitAssetCode/debitAssetScale, fees included. */
  debitAmount: number;
  debitAssetCode: string;
  debitAssetScale: number;
  /** Minor units of the project currency (COP). */
  receiveAmount: number;
  /** ISO timestamp; null when the wallet sets none (simulated). */
  expiresAt: string | null;
}

export interface Investment {
  id: string;
  projectId: string;
  /** Better Auth user id of the investor; never taken from a request body. */
  investorUserId: string;
  walletAddress: string;
  status: InvestmentStatus;
  failureReason: string | null;
  /** COP the custody receives, in the project's minor units. */
  amount: number;
  currency: string;
  assetScale: number;
  quote: CaptureQuote | null;
  /** TRM_0: COP per unit of the investor's currency, "numerator/denominator" reduced (see impliedRate). */
  impliedRate: string | null;
  incomingPaymentId: string | null;
  outgoingPaymentId: string | null;
  createdAt: Date;
  capturedAt: Date | null;
}

// PRD v3 "Límites regulatorios" (D-01, SFC authorization assumed): a non-qualified investor puts at most 10 % of the project.
// The 20 %-of-income rule and the qualified-investor exemption need a classification the registry does not hold yet:
// ponytail: every investor is treated as non-qualified and only the 10 % cap applies; change this constant to tune the demo.
export const NON_QUALIFIED_CAP_PCT = 10;

// RF-07: investors only subscribe to a published project. The publish gate (simulation module) is the only flow that moves a
// project to FUNDING_IN_PROGRESS; DRAFT and CONTRACT_SIGNED are still being prepared and never take investor money.
export const FUNDABLE_STATUSES: readonly ProjectStatus[] = [PROJECT_STATUS.FUNDING_IN_PROGRESS];

// An abandoned consent must not hold the project's remaining amount (or block the investor) forever.
// ponytail: a pending investment stops reserving after 30 minutes; a late wallet callback still completes it (its money is real).
export const RESERVATION_TTL_MS = 30 * 60_000;

/** Quotes this close to expiresAt count as expired: the outgoing payment is created a moment after the check. */
export const QUOTE_EXPIRY_MARGIN_MS = 10_000;

const isReserving = (i: Investment, now: Date) => i.status === INVESTMENT_STATUS.PENDING_CONSENT && now.getTime() - i.createdAt.getTime() < RESERVATION_TTL_MS;
const isCaptured = (i: Investment) => i.status === INVESTMENT_STATUS.CAPTURED;
const sum = (items: Investment[]) => items.reduce((total, i) => total + i.amount, 0);

export type InvestRefusal = "project_status" | "amount" | "exceeds_remaining" | "investor_cap" | "in_flight";

type InvestRequest = {
  project: Pick<Project, "currentStatus" | "targetAmount">;
  /** Every investment of the project. */
  investments: Investment[];
  investorUserId: string;
  amount: number;
  now: Date;
  capPct?: number;
};

/** Why this subscription cannot start, or null. Run under the project lock so concurrent ones see each other's reservation. */
export function canInvest({ project, investments, investorUserId, amount, now, capPct = NON_QUALIFIED_CAP_PCT }: InvestRequest): InvestRefusal | null {
  if (!FUNDABLE_STATUSES.includes(project.currentStatus)) return "project_status";
  if (!Number.isSafeInteger(amount) || amount <= 0) return "amount";
  const mine = investments.filter((i) => i.investorUserId === investorUserId);
  if (mine.some((i) => isReserving(i, now))) return "in_flight";
  const held = investments.filter((i) => isCaptured(i) || isReserving(i, now));
  if (amount > project.targetAmount - sum(held)) return "exceeds_remaining";
  const cap = (BigInt(project.targetAmount) * BigInt(capPct)) / 100n;
  if (BigInt(sum(held.filter((i) => i.investorUserId === investorUserId)) + amount) > cap) return "investor_cap";
  return null;
}

/** A published project fills up; any other status (unpublished, funded or beyond) is kept. */
export function projectStatusAfterCapture(status: ProjectStatus, custodyAfter: number, target: number): ProjectStatus {
  if (!FUNDABLE_STATUSES.includes(status)) return status;
  return custodyAfter >= target ? PROJECT_STATUS.FUNDED_IN_CUSTODY : PROJECT_STATUS.FUNDING_IN_PROGRESS;
}

type Amount = { value: number; assetScale: number };

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

/** Received COP per unit of the debited currency: (receive / 10^rs) / (debit / 10^ds), as a reduced "n/d". */
export function impliedRate(receive: Amount, debit: Amount): string {
  if (debit.value <= 0 || receive.value <= 0) throw new DomainError("An implied rate needs positive amounts on both sides");
  const n = BigInt(receive.value) * 10n ** BigInt(debit.assetScale);
  const d = BigInt(debit.value) * 10n ** BigInt(receive.assetScale);
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
}

export const withQuote = (investment: Investment, quote: CaptureQuote): Investment => ({
  ...investment,
  quote,
  impliedRate: impliedRate({ value: quote.receiveAmount, assetScale: investment.assetScale }, { value: quote.debitAmount, assetScale: quote.debitAssetScale }),
});

// PAYMENT_GATEWAY=simulated only: COP per unit of each currency, as [numerator, denominator].
// ponytail: a fixed demo table (EUR ≈ 4.400, USD ≈ 4.000); the real rate comes from the Open Payments quote.
export const SIMULATED_COP_RATES: Record<string, readonly [bigint, bigint]> = { COP: [1n, 1n], USD: [4_000n, 1n], EUR: [4_400n, 1n] };

/** The quote the simulated mode "gets": debit rounded up so the custody always receives the full amount. */
export function simulatedQuote(investmentId: string, receive: number, receiveScale: number, wallet: { assetCode: string; assetScale: number }, now: Date): CaptureQuote {
  const rate = SIMULATED_COP_RATES[wallet.assetCode];
  if (!rate) throw new DomainError(`Simulated capture has no rate for ${wallet.assetCode}`);
  const [num, den] = rate;
  const top = BigInt(receive) * 10n ** BigInt(wallet.assetScale) * den;
  const bottom = 10n ** BigInt(receiveScale) * num;
  const debit = (top + bottom - 1n) / bottom;
  return {
    id: `SIM-QUOTE-${investmentId}`,
    debitAmount: Number(debit),
    debitAssetCode: wallet.assetCode,
    debitAssetScale: wallet.assetScale,
    receiveAmount: receive,
    expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString(),
  };
}

/** RNF-13: an expired quote is never executed. */
export const mustRequote = (expiresAt: string | null, now: Date) => expiresAt !== null && Date.parse(expiresAt) - now.getTime() <= QUOTE_EXPIRY_MARGIN_MS;

/** The grant's debitAmount limit is the first quote's debit, exact (PRD: limits.debitAmount = the contribution in their currency). */
export const exceedsGrant = (debit: number, limit: number) => debit > limit;

export type CurrencyTotal = { currency: string; debited: string; received: number };
export type CaptureSummary = { target: number; raised: number; progressPct: number; investorsCount: number; byCurrency: CurrencyTotal[] };

/** The capture bar (RF-10): captured investments only; debited per currency as a string so it never rounds. */
export function captureSummary(project: Pick<Project, "targetAmount">, investments: Investment[]): CaptureSummary {
  const captured = investments.filter(isCaptured);
  const raised = sum(captured);
  const byCurrency = new Map<string, { debited: bigint; received: number }>();
  for (const i of captured) {
    const currency = i.quote?.debitAssetCode ?? i.currency;
    const row = byCurrency.get(currency) ?? { debited: 0n, received: 0 };
    row.debited += BigInt(i.quote?.debitAmount ?? i.amount);
    row.received += i.amount;
    byCurrency.set(currency, row);
  }
  const progressPct = project.targetAmount > 0 ? Math.min(100, Number((BigInt(raised) * 100n) / BigInt(project.targetAmount))) : 0;
  return {
    target: project.targetAmount,
    raised,
    progressPct,
    investorsCount: new Set(captured.map((i) => i.investorUserId)).size,
    byCurrency: [...byCurrency].map(([currency, r]) => ({ currency, debited: r.debited.toString(), received: r.received })),
  };
}
