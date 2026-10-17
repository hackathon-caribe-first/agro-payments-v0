import type { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import type { Custody, ForeignAmount, HarvestEnvelope, InvestorPanel } from "../domain/harvest";
import { custodyDtoSchema, harvestEnvelopeDtoSchema, panelDtoSchema, type CustodyDto } from "./dto";

function parse<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid ${what}: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

const foreign = (a: { value: string; asset_code: string; asset_scale: number } | null): ForeignAmount | null =>
  a && { value: a.value, assetCode: a.asset_code, assetScale: a.asset_scale };

const fromCustody = (d: CustodyDto): Custody => ({
  projectId: d.project_id,
  currency: d.currency,
  balance: d.balance,
  overdrawn: d.overdrawn ?? d.balance < 0,
  credited: d.credited,
  credits: d.credits,
  debits: d.debits,
  debited: d.debited,
  ledgerDebits: d.ledger_debits,
  milestoneDebits: d.milestone_debits,
  settlementDebits: d.settlement_debits,
});

export function toHarvestEnvelope(data: unknown): HarvestEnvelope {
  const d = parse(harvestEnvelopeDtoSchema, data, "harvest");
  const h = d.harvest;
  return {
    projectId: d.project_id,
    projectCode: d.project_code,
    projectTitle: d.project_title,
    projectStatus: d.project_status,
    paymentRedirectUrl: d.payment_redirect_url,
    harvest: h && {
      status: h.status,
      declaredQuantityKg: h.declared_quantity_kg,
      declaredQuality: h.declared_quality,
      evidence: h.evidence,
      declaredAt: h.declared_at,
      certifiedQuantityKg: h.certified_quantity_kg,
      certifiedQuality: h.certified_quality,
      certificationNotes: h.certification_notes,
      certifiedAt: h.certified_at,
      price: h.price && { source: h.price.source, pricePerKg: h.price.price_per_kg, exchangeFactor: h.price.exchange_factor },
      amountDue: h.amount_due,
      currency: h.currency,
      buyerId: h.buyer_id,
      paymentReference: h.payment_reference,
      paidAt: h.paid_at,
      receivedAt: h.received_at,
    },
  };
}

export const toHarvestEnvelopes = (data: unknown): HarvestEnvelope[] => (Array.isArray(data) ? data.map(toHarvestEnvelope) : (() => { throw new BoundaryError("Invalid harvests"); })());

export const toCustody = (data: unknown): Custody => fromCustody(parse(custodyDtoSchema, data, "custody"));

export function toInvestorPanel(data: unknown): InvestorPanel {
  const d = parse(panelDtoSchema, data, "investor panel");
  const r = d.realized;
  return {
    project: { id: d.project.id, projectCode: d.project.project_code, title: d.project.title, currentStatus: d.project.current_status, currency: d.project.currency },
    capture: {
      targetAmount: d.capture.target_amount,
      raised: d.capture.raised,
      progressPct: d.capture.progress_pct,
      investorsCount: d.capture.investors_count,
      byCurrency: d.capture.by_currency.map((c) => ({ currency: c.currency, debited: c.debited, receivedCop: c.received_cop })),
    },
    custody: fromCustody(d.custody),
    milestones: d.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      sequenceOrder: m.sequence_order,
      status: m.status,
      grant: m.grant,
      lines: m.lines.map((l) => ({
        id: l.id,
        kind: l.kind,
        beneficiary: l.beneficiary,
        amount: l.amount,
        status: l.status,
        reference: l.reference,
        settledAt: l.settled_at,
        outgoingPaymentId: l.receipt?.outgoing_payment_id ?? null,
      })),
    })),
    investments: d.my_investments.map((i) => ({
      id: i.id,
      status: i.status,
      amount: i.amount,
      currency: i.currency,
      debit: foreign(i.debit),
      receiveAmount: i.receive_amount,
      impliedRate: i.implied_rate,
      outgoingPaymentId: i.outgoing_payment_id,
      capturedAt: i.captured_at,
      payouts: i.payouts.map((p) => ({
        id: p.id,
        status: p.status,
        amount: p.amount,
        walletCurrency: p.wallet_currency,
        reference: p.reference,
        settledAt: p.settled_at,
        receiveAmount: foreign(p.receipt?.receive_amount ?? null),
        rate: p.receipt?.rate ?? null,
      })),
    })),
    realized:
      r.status === "settled"
        ? {
            status: "settled",
            days: r.days ?? 0,
            capital: r.capital ?? 0,
            returned: r.returned ?? 0,
            tirCopPct: r.tir_cop_pct ?? null,
            investorCurrency: r.investor_currency ?? d.project.currency,
            tirInvestorCurrencyPct: r.tir_investor_currency_pct ?? null,
            exitRateAssumed: r.exit_rate_assumed ?? false,
          }
        : { status: "pending" },
    median: d.median && {
      tirCopPct: d.median.tir_cop_pct,
      investorCurrency: d.median.investor_currency,
      exitRate: d.median.exit_rate,
      tirInvestorCurrencyPct: d.median.tir_investor_currency_pct,
    },
  };
}
