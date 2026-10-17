// Domain → /api wire shapes: snake_case, money in whole pesos (prices may carry cents), user ids as public ids.
import type { IdAliases } from "../../auth/application/demo-parties";
import type { Viewer } from "../../projects/application/project";
import { type ContractDocument, fullySigned, signableParties } from "../application/contract-document";
import { type InsuranceClaim, type InsurancePolicy, sumInsured, thresholdYield } from "../application/insurance";
import { PRICE_TYPE, type PurchaseContract } from "../application/purchase-contract";

const units = (minor: number) => minor / 100;

export const toPurchaseContractResponse = (c: PurchaseContract, ids: IdAliases, buyer: { name: string; email: string } | null) => ({
  project_id: c.projectId,
  price_type: c.price.type,
  price_per_unit: c.price.type === PRICE_TYPE.FIXED ? units(c.price.pricePerUnit) : null,
  floor_per_unit: c.price.type === PRICE_TYPE.FORMULA ? units(c.price.floorPerUnit) : null,
  ceiling_per_unit: c.price.type === PRICE_TYPE.FORMULA ? units(c.price.ceilingPerUnit) : null,
  price_reference: c.price.type === PRICE_TYPE.FORMULA ? c.price.reference : null,
  quantity: c.quantity,
  unit: c.unit,
  currency: c.currency,
  // RF-32: a USD contract is stored but not settled yet.
  settles: c.currency === "COP",
  buyer_id: ids.toPublic(c.buyerUserId),
  buyer_name: buyer?.name ?? null,
  buyer_email: buyer?.email ?? null,
  buyer_wallet_address: c.buyerWalletAddress,
  buyer_wallet_asset_code: c.buyerWalletAssetCode,
  updated_at: c.updatedAt.toISOString(),
});

export const toPolicyResponse = (p: InsurancePolicy) => {
  const t = p.terms;
  const payment = p.premiumPayment;
  return {
    project_id: p.projectId,
    insurer_name: p.insurerName,
    insurer_wallet_address: p.insurerWalletAddress,
    beneficiary: p.beneficiary,
    source: p.source,
    simulation_run_id: p.simulationRunId,
    premium: units(t.grossPremium),
    subsidy_pct: t.subsidyPct,
    net_premium: units(t.netPremium),
    threshold_pct: t.thresholdPct,
    threshold_yield_kg_per_ha: Math.round(thresholdYield(t) * 100) / 100,
    deductible_pct: t.deductiblePct,
    hectares: t.hectares,
    expected_yield_kg_per_ha: t.expectedYieldKgPerHa,
    insured_price_per_kg: units(t.insuredPricePerKg),
    sum_insured: units(sumInsured(t)),
    index_trigger: t.indexTrigger,
    index_exit: t.indexExit,
    premium_payment: payment
      ? {
          id: payment.id,
          amount: units(payment.amount),
          status: payment.status,
          reference: payment.reference,
          incoming_payment_id: payment.receipt?.incomingPaymentId ?? null,
          outgoing_payment_id: payment.receipt?.outgoingPaymentId ?? null,
          requested_at: payment.requestedAt.toISOString(),
          completed_at: payment.completedAt?.toISOString() ?? null,
        }
      : null,
    updated_at: p.updatedAt.toISOString(),
  };
};

export const toClaimResponse = (c: InsuranceClaim) => ({
  id: c.id,
  project_id: c.projectId,
  trigger: c.trigger,
  observed_value: c.observedValue,
  evidence: c.evidence,
  amount: units(c.amount),
  status: c.status,
  incoming_payment_url: c.incomingPaymentUrl,
  created_at: c.createdAt.toISOString(),
  confirmed_at: c.confirmedAt?.toISOString() ?? null,
});

/** Signatures keep their ip and user agent in the database (audit); the wire shows who, as what, when and over which hash. */
export const toContractResponse = (d: ContractDocument, ids: IdAliases, viewer: Viewer) => ({
  id: d.id,
  project_id: d.projectId,
  version: d.version,
  hash: d.hash,
  body: d.body,
  status: fullySigned(d) ? "signed" : "pending_signatures",
  parties: d.parties.map((p) => ({
    role: p.role,
    user_id: p.userId === null ? null : ids.toPublic(p.userId),
    name: p.name,
    signed: d.signatures.some((s) => s.partyRole === p.role && (p.userId === null || s.userId === p.userId)),
  })),
  signatures: d.signatures.map((s) => ({ party_role: s.partyRole, user_id: ids.toPublic(s.userId), signed_at: s.signedAt.toISOString(), contract_hash: s.contractHash })),
  signable_roles: signableParties(d, viewer).map((p) => p.role),
  created_at: d.createdAt.toISOString(),
});
