// Domain → /api wire. Project-currency amounts leave in whole pesos (like the rest of /api); foreign-wallet amounts stay minor units
// as strings with their asset, like the investment receipts.
import type { IdAliases } from "../../auth/application/demo-parties";
import type { ReceiptAmount } from "../../milestones/application/milestone";
import { minorToPesos, type Project } from "../../projects/application/project";
import type { Payout } from "../../settlement/application/settlement";
import type { InvestorPanel } from "../application/investor-panel.use-cases";
import type { Harvest, PriceTerms } from "../domain/harvest";
import type { CustodyStatement } from "../domain/panel";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const termsResponse = (t: PriceTerms) =>
  t.kind === "fixed"
    ? { kind: t.kind, price_per_kg: t.pricePerKg }
    : { kind: t.kind, spot_price_per_kg: t.spotPerKg, floor_price_per_kg: t.floorPerKg, ceiling_price_per_kg: t.ceilingPerKg, discount_pct: t.discountBps / 100 };

export function toHarvestResponse(project: Project, harvest: Harvest | null, ids: IdAliases, redirectUrl: string | null = null) {
  return {
    project_id: project.id,
    project_code: project.projectCode,
    project_title: project.title,
    project_status: project.currentStatus,
    harvest: harvest && {
      status: harvest.status,
      declared_quantity_kg: harvest.declaredQuantityKg,
      declared_quality: harvest.declaredQuality,
      evidence: harvest.evidence,
      declared_at: harvest.declaredAt.toISOString(),
      certified_quantity_kg: harvest.certifiedQuantityKg,
      certified_quality: harvest.certifiedQuality,
      certification_notes: harvest.certificationNotes,
      certified_at: iso(harvest.certifiedAt),
      price: harvest.price && {
        source: harvest.price.source,
        price_per_kg: harvest.price.pricePerKg,
        exchange_factor: harvest.price.exchangeFactor,
        terms: termsResponse(harvest.price.terms),
      },
      amount_due: harvest.amountDue === null ? null : minorToPesos(harvest.amountDue, harvest.assetScale),
      currency: harvest.currency,
      buyer_id: harvest.buyerUserId === null ? null : ids.toPublic(harvest.buyerUserId),
      payment_reference: harvest.paymentReference,
      paid_at: iso(harvest.paidAt),
      received_at: iso(harvest.receivedAt),
    },
    payment_redirect_url: redirectUrl,
  };
}

export function toCustodyResponse(projectId: string, s: CustodyStatement) {
  const pesos = (minor: number) => minorToPesos(minor, s.assetScale);
  return {
    project_id: projectId,
    currency: s.currency,
    balance: pesos(s.balance),
    credited: pesos(s.credited),
    credits: s.credits.map((c) => ({ category: c.category, amount: pesos(c.amount) })),
    debited: pesos(s.milestoneDebits + s.settlementDebits),
    milestone_debits: pesos(s.milestoneDebits),
    settlement_debits: pesos(s.settlementDebits),
  };
}

const foreign = (a: ReceiptAmount | null) => a && { value: String(a.value), asset_code: a.assetCode, asset_scale: a.assetScale };

const payoutResponse = (p: Payout, assetScale: number) => ({
  id: p.id,
  status: p.status,
  amount: minorToPesos(p.amount, assetScale),
  wallet_currency: p.walletCurrency,
  reference: p.reference,
  settled_at: iso(p.settledAt),
  receipt: p.receipt && { debit_amount: foreign(p.receipt.debitAmount), receive_amount: foreign(p.receipt.receiveAmount), rate: p.receipt.rate },
});

export function toPanelResponse(panel: InvestorPanel, ids: IdAliases) {
  const { project, capture, custody, realized, median } = panel;
  const pesos = (minor: number) => minorToPesos(minor, project.assetScale);
  return {
    project: { id: project.id, project_code: project.projectCode, title: project.title, current_status: project.currentStatus, currency: project.currency },
    capture: {
      target_amount: pesos(capture.target),
      raised: pesos(capture.raised),
      progress_pct: capture.progressPct,
      investors_count: capture.investorsCount,
      by_currency: capture.byCurrency.map((c) => ({ currency: c.currency, debited: c.debited, received_cop: pesos(c.received) })),
    },
    custody: toCustodyResponse(project.id, custody),
    milestones: panel.milestones.map(({ milestone: m, status, grant }) => ({
      id: m.id,
      title: m.title,
      sequence_order: m.sequenceOrder,
      status,
      grant: { status: grant.status, cap: pesos(grant.cap), spent: pesos(grant.spent), remaining: pesos(grant.remaining) },
      lines: m.lines.map((l) => ({
        id: l.id,
        kind: l.kind,
        beneficiary: l.beneficiary,
        amount: pesos(l.amount),
        status: l.status,
        reference: l.reference,
        settled_at: iso(l.settledAt),
        receipt: l.receipt && {
          debit_amount: foreign(l.receipt.debitAmount),
          receive_amount: foreign(l.receipt.receiveAmount),
          rate: l.receipt.rate,
          outgoing_payment_id: l.receipt.outgoingPaymentId,
        },
      })),
    })),
    my_investments: panel.myInvestments.map(({ investment: i, payouts }) => ({
      id: i.id,
      investor_id: ids.toPublic(i.investorUserId),
      status: i.status,
      amount: pesos(i.amount),
      currency: i.currency,
      debit: i.quote && { value: String(i.quote.debitAmount), asset_code: i.quote.debitAssetCode, asset_scale: i.quote.debitAssetScale },
      receive_amount: i.quote ? pesos(i.quote.receiveAmount) : null,
      implied_rate: i.impliedRate,
      outgoing_payment_id: i.outgoingPaymentId,
      captured_at: iso(i.capturedAt),
      payouts: payouts.map((p) => payoutResponse(p, project.assetScale)),
    })),
    realized:
      realized.status === "pending"
        ? { status: realized.status }
        : {
            status: realized.status,
            settlement_id: realized.settlementId,
            days: realized.days,
            capital: pesos(realized.capital),
            returned: pesos(realized.returned),
            tir_cop_pct: realized.tirCopPct,
            investor_currency: realized.investorCurrency,
            tir_investor_currency_pct: realized.tirInvestorCurrencyPct,
            exit_rate_assumed: realized.exitRateAssumed,
          },
    median: median && {
      run_id: median.runId,
      created_at: median.createdAt.toISOString(),
      tir_cop_pct: median.tirCopPct,
      investor_currency: median.investorCurrency,
      entry_rate: median.entryRate,
      exit_rate: median.exitRate,
      tir_investor_currency_pct: median.tirInvestorCurrencyPct,
    },
  };
}
