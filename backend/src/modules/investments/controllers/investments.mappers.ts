// Investments → /api wire shapes: COP amounts in whole pesos like the rest of /api; the investor's debit stays a minor-unit
// string with its asset (RNF-10: it never goes through a float), and the rate is the exact "n/d" COP per unit of that asset.
import type { IdAliases } from "../../auth/application/demo-parties";
import { minorToPesos, type Project } from "../../projects/application/project";
import { toProjectResponse } from "../../projects/controllers/api.mappers";
import type { InvestmentOutcome } from "../application/investments.use-cases";
import type { CaptureSummary } from "../domain/investment";

export const toInvestmentResponse = (i: InvestmentOutcome, ids: IdAliases) => ({
  id: i.id,
  project_id: i.projectId,
  investor_id: ids.toPublic(i.investorUserId),
  wallet_address: i.walletAddress,
  status: i.status,
  failure_reason: i.failureReason,
  amount: minorToPesos(i.amount, i.assetScale),
  currency: i.currency,
  quote: i.quote && {
    id: i.quote.id,
    debit_amount: String(i.quote.debitAmount),
    debit_asset_code: i.quote.debitAssetCode,
    debit_asset_scale: i.quote.debitAssetScale,
    receive_amount: minorToPesos(i.quote.receiveAmount, i.assetScale),
    expires_at: i.quote.expiresAt,
  },
  implied_rate: i.impliedRate,
  incoming_payment_id: i.incomingPaymentId,
  outgoing_payment_id: i.outgoingPaymentId,
  created_at: i.createdAt.toISOString(),
  captured_at: i.capturedAt?.toISOString() ?? null,
  ...(i.consentRedirectUrl && { consent_redirect_url: i.consentRedirectUrl }),
});

export const toCaptureResponse = (s: CaptureSummary & { currency: string; assetScale: number }) => ({
  target_amount: minorToPesos(s.target, s.assetScale),
  raised: minorToPesos(s.raised, s.assetScale),
  currency: s.currency,
  progress_pct: s.progressPct,
  investors_count: s.investorsCount,
  by_currency: s.byCurrency.map((c) => ({ currency: c.currency, debited: c.debited, received_cop: minorToPesos(c.received, s.assetScale) })),
});

/** A project of the investor catalog: the /api project shape plus its capture bar. */
export const toInvestorProjectResponse = ({ project, summary }: { project: Project; summary: CaptureSummary }) => ({
  ...toProjectResponse(project),
  capture: toCaptureResponse({ ...summary, currency: project.currency, assetScale: project.assetScale }),
});
