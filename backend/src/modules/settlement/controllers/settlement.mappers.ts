// Domain → /api wire shapes: snake_case, amounts in whole pesos of the settlement currency. Receipt amounts stay in
// minor units of their own asset (a foreign wallet's receive amount is not in pesos).
import type { LineReceipt, ReceiptAmount } from "../../milestones/application/milestone";
import { minorToPesos } from "../../projects/application/project";
import type { Allocation, LiquidationPlan } from "../application/liquidation";
import type { Payout, Settlement, SettlementTerms } from "../application/settlement";

const amountOf = (a: ReceiptAmount | null) => (a ? { value: a.value, asset_code: a.assetCode, asset_scale: a.assetScale } : null);

const toReceipt = (r: LineReceipt | null) =>
  r && {
    incoming_payment_id: r.incomingPaymentId,
    outgoing_payment_id: r.outgoingPaymentId,
    quote_id: r.quoteId,
    debit_amount: amountOf(r.debitAmount),
    receive_amount: amountOf(r.receiveAmount),
    rate: r.rate,
    fee: r.fee,
    grant_spent_before: r.grantSpentBefore,
    grant_spent_after: r.grantSpentAfter,
  };

type Plan = { currency: string; assetScale: number; preferredRateBps: number; terms: SettlementTerms; plan: LiquidationPlan; payouts: Payout[] };

export function toPlanResponse({ currency, assetScale, preferredRateBps, terms, plan, payouts }: Plan) {
  const pesos = (minor: number) => minorToPesos(minor, assetScale);
  const allocation = (a: Allocation) => ({ beneficiary_kind: a.beneficiary.kind, beneficiary_id: a.beneficiary.id, amount: pesos(a.amount) });
  return {
    currency,
    proceeds: pesos(terms.proceeds),
    integrator_debt: pesos(terms.integratorDebt),
    producer_contribution: pesos(terms.producerContribution),
    days: terms.days,
    preferred_rate_pct: preferredRateBps / 100,
    investors: terms.investors.map((i) => ({ id: i.id, capital: pesos(i.capital), currency: i.currency, wallet_address: i.walletAddress })),
    tiers: plan.tiers.map((t) => ({ tier: t.tier, claim: t.claim === null ? null : pesos(t.claim), paid: pesos(t.paid), allocations: t.allocations.map(allocation) })),
    totals: plan.totals.map(allocation),
    investors_total: pesos(plan.investorsTotal),
    shortfall: pesos(plan.shortfall),
    payouts: payouts.map((p) => ({
      id: p.id,
      beneficiary_kind: p.beneficiary.kind,
      beneficiary_id: p.beneficiary.id,
      wallet_address: p.walletAddress,
      wallet_currency: p.walletCurrency,
      amount: pesos(p.amount),
      fixed_debit_amount: p.fixedDebitAmount,
      status: p.status,
      reference: p.reference,
      settled_at: p.settledAt?.toISOString() ?? null,
      receipt: toReceipt(p.receipt),
    })),
  };
}

export const toSettlementResponse = (s: Settlement) => ({
  id: s.id,
  project_id: s.projectId,
  status: s.status,
  ...toPlanResponse(s),
  created_by: s.createdBy,
  created_at: s.createdAt.toISOString(),
  approved_by: s.approvedBy,
  approved_at: s.approvedAt?.toISOString() ?? null,
  executed_at: s.executedAt?.toISOString() ?? null,
});
