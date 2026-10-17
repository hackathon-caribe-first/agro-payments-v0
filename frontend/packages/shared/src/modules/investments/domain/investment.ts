// Investor capture (PRD v3 RF-10, RF-29): an investor's COP contribution to a project's custody, debited from their own wallet
// in its currency. COP amounts are whole pesos like the rest of /api; the debit stays a minor-unit string (never a float) and
// the implied rate is an exact "numerator/denominator" of COP per unit of the investor's currency.
import type { Project } from "../../projects/domain/project";

export const INVESTMENT_STATUSES = ["PENDING_CONSENT", "CAPTURED", "FAILED"] as const;
// Values added by a newer server map to "UNKNOWN" so they degrade instead of crashing.
export type InvestmentStatus = (typeof INVESTMENT_STATUSES)[number] | "UNKNOWN";

export interface CaptureQuote {
  id: string;
  /** Minor units of debitAssetCode at debitAssetScale. */
  debitAmount: string;
  debitAssetCode: string;
  debitAssetScale: number;
  /** COP pesos. */
  receiveAmount: number;
  expiresAt: string | null;
}

export interface Investment {
  id: string;
  projectId: string;
  investorId: string;
  walletAddress: string;
  status: InvestmentStatus;
  failureReason: string | null;
  /** COP pesos the custody receives. */
  amount: number;
  currency: string;
  quote: CaptureQuote | null;
  impliedRate: string | null;
  incomingPaymentId: string | null;
  outgoingPaymentId: string | null;
  createdAt: string;
  capturedAt: string | null;
  /** Only on the POST answer while the investor must approve in their wallet. */
  consentRedirectUrl?: string;
}

export interface CurrencyCapture {
  currency: string;
  /** Minor units of that currency. */
  debited: string;
  receivedCop: number;
}

export interface Capture {
  targetAmount: number;
  raised: number;
  currency: string;
  progressPct: number;
  investorsCount: number;
  byCurrency: CurrencyCapture[];
}

export interface InvestorProject {
  project: Project;
  capture: Capture;
}

const groups = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** "40000/9" → "4.444,44" (es-CO), rounded half up in BigInt; null when it is not a rate. */
export function rateText(ratio: string, decimals = 2): string | null {
  const match = /^(\d+)\/(\d+)$/.exec(ratio);
  if (!match || match[2] === "0") return null;
  const scale = 10n ** BigInt(decimals);
  const n = BigInt(match[1]) * scale;
  const d = BigInt(match[2]);
  const scaled = (n * 2n + d) / (2n * d);
  const digits = scaled.toString().padStart(decimals + 1, "0");
  const whole = groups(digits.slice(0, digits.length - decimals));
  return decimals ? `${whole},${digits.slice(digits.length - decimals)}` : whole;
}
