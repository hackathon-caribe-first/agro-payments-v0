// RF-05 / RF-14 / RF-25: the ISA crop policy of a project and the Anexo A6 indemnity. Pure functions: no Nest, no I/O.
// Money in COP minor units (assetScale 2), always rounded to WHOLE pesos: the custody ledger books whole pesos.

import { RejectedError } from "../../../shared/domain-errors";
import { insurancePremium, type SimulationInputs, type SimulationSheet } from "../../simulation/application/motor";
import type { LineReceipt } from "../../milestones/application/milestone";

/** D-11: the beneficiary is always the patrimonio autónomo (the custody), never the producer. */
export const BENEFICIARY = "PATRIMONIO_AUTONOMO";
/** Anexo A «Símbolos y valores de referencia»: σ_ISA 85 %, Y_gat 70 %, Ded 10 %. */
export const ISA_DEFAULTS = { subsidyPct: 85, thresholdPct: 70, deductiblePct: 10 } as const;

export const POLICY_SOURCE = { SIMULATION: "simulation", INPUT: "input" } as const;
export type PolicySource = (typeof POLICY_SOURCE)[keyof typeof POLICY_SOURCE];

export const CLAIM_TRIGGER = { YIELD: "yield", INDEX: "index" } as const;
export type ClaimTrigger = (typeof CLAIM_TRIGGER)[keyof typeof CLAIM_TRIGGER];

export interface PolicyTerms {
  /** H */
  hectares: number;
  /** E[Y], kg/ha */
  expectedYieldKgPerHa: number;
  /** λ, percent */
  shrinkagePct: number;
  /** P_aseg, minor units per kg */
  insuredPricePerKg: number;
  /** Y_gat as a percentage of E[Y] */
  thresholdPct: number;
  /** Ded as a percentage of the guaranteed value */
  deductiblePct: number;
  /** H·P_seg before the subsidy, minor units */
  grossPremium: number;
  /** σ_ISA, percent */
  subsidyPct: number;
  /** H·P_seg(1 − σ_ISA): what custody pays the insurer (RF-14), minor units */
  netPremium: number;
  /** Parametric variant: Trig and Exit of the index; null when the policy has no index. */
  indexTrigger: number | null;
  indexExit: number | null;
}

export const PREMIUM_STATUS = { EXECUTING: "executing", COMPLETED: "completed", FAILED: "failed" } as const;
export type PremiumStatus = (typeof PREMIUM_STATUS)[keyof typeof PREMIUM_STATUS];

/** RF-14: the one payment of the net premium from custody to the insurer. */
export interface PremiumPayment {
  id: string;
  amount: number;
  status: PremiumStatus;
  reference: string | null;
  receipt: LineReceipt | null;
  requestedBy: string;
  requestedAt: Date;
  completedAt: Date | null;
}

export interface InsurancePolicy {
  projectId: string;
  insurerName: string;
  insurerWalletAddress: string;
  beneficiary: typeof BENEFICIARY;
  source: PolicySource;
  simulationRunId: string | null;
  terms: PolicyTerms;
  premiumPayment: PremiumPayment | null;
  updatedBy: string;
  updatedAt: Date;
}

export const CLAIM_STATUS = { PENDING: "pending", CONFIRMED: "confirmed" } as const;
export type ClaimStatus = (typeof CLAIM_STATUS)[keyof typeof CLAIM_STATUS];

/** RF-25: an indemnity owed to custody; booked (ledger CREDIT INDEMNITY) only once confirmed. */
export interface InsuranceClaim {
  id: string;
  projectId: string;
  trigger: ClaimTrigger;
  observedValue: number;
  evidence: string;
  amount: number;
  status: ClaimStatus;
  /** Open Payments mode: the incoming payment on custody the insurer pays into. */
  incomingPaymentUrl: string | null;
  createdBy: string;
  createdAt: Date;
  confirmedBy: string | null;
  confirmedAt: Date | null;
}

const PESO = 100;
/** Half up to the whole peso. */
export const toWholePesos = (minor: number) => Math.round(minor / PESO) * PESO;
const frac = (pct: number) => pct / 100;

export const netPremium = (grossPremium: number, subsidyPct: number) => toWholePesos(grossPremium * (1 - frac(subsidyPct)));

/** Y_gat = threshold·E[Y], kg/ha. */
export const thresholdYield = (t: PolicyTerms) => frac(t.thresholdPct) * t.expectedYieldKgPerHa;

/** Valor garantizado per ha: Y_gat·(1 − λ)·P_aseg (the motor's convention, A6). */
const guaranteedValuePerHa = (t: PolicyTerms) => thresholdYield(t) * (1 - frac(t.shrinkagePct)) * t.insuredPricePerKg;

/** SA of the parametric variant: the guaranteed value of the whole area. */
export const sumInsured = (t: PolicyTerms) => toWholePesos(t.hectares * guaranteedValuePerHa(t));

/**
 * Anexo A6. Traditional: Ind = H·max(0, (Y_gat − Y_real)(1 − λ)P_aseg − Ded), only when the yield fell below Y_gat.
 * Parametric: Ind = SA·min(1, max(0, (Trig − Idx)/(Trig − Exit))), only when the index fell below its trigger (a deficit index,
 * e.g. rainfall). Every refusal is a form-level 409 the fiduciaria can read.
 */
export function indemnity(t: PolicyTerms, claim: { trigger: ClaimTrigger; observedValue: number }): number {
  if (claim.trigger === CLAIM_TRIGGER.YIELD) {
    const threshold = thresholdYield(t);
    if (claim.observedValue >= threshold) {
      throw new RejectedError(`El rendimiento observado no cae del umbral de la póliza (${threshold.toLocaleString("es-CO")} kg/ha).`);
    }
    const deductible = frac(t.deductiblePct) * guaranteedValuePerHa(t);
    const amount = toWholePesos(t.hectares * Math.max(0, (threshold - claim.observedValue) * (1 - frac(t.shrinkagePct)) * t.insuredPricePerKg - deductible));
    if (amount <= 0) throw new RejectedError("La pérdida no supera el deducible de la póliza: la indemnización es cero.");
    return amount;
  }
  if (t.indexTrigger === null || t.indexExit === null) throw new RejectedError("La póliza no tiene un índice paramétrico: reclama por rendimiento.");
  if (claim.observedValue >= t.indexTrigger) throw new RejectedError(`El índice observado no alcanza el disparo de la póliza (${t.indexTrigger}).`);
  const share = Math.min(1, Math.max(0, (t.indexTrigger - claim.observedValue) / (t.indexTrigger - t.indexExit)));
  return toWholePesos(sumInsured(t) * share);
}

/**
 * The motor's figures win when the project has a sheet (RNF-11: the policy then matches what the offer rule priced):
 * the net premium is the sheet's (A2, already in custody's K), the gross one the same formula without the subsidy.
 */
export function termsFromSimulation(inputs: SimulationInputs, sheet: SimulationSheet): PolicyTerms {
  const grossPremium = insurancePremium({ ...inputs, insurance: { ...inputs.insurance, subsidyPct: 0 } });
  return {
    hectares: inputs.hectares,
    expectedYieldKgPerHa: inputs.expectedYieldKgPerHa,
    shrinkagePct: inputs.shrinkagePct,
    insuredPricePerKg: sheet.offer.contractPricePerKg,
    thresholdPct: inputs.insurance.triggerPct,
    deductiblePct: inputs.insurance.deductiblePct,
    grossPremium: toWholePesos(grossPremium),
    subsidyPct: inputs.insurance.subsidyPct,
    netPremium: toWholePesos(sheet.capital.insurancePremium),
    indexTrigger: null,
    indexExit: null,
  };
}

/** A policy is fixed once its premium left (or is leaving) custody. */
export const premiumLocked = (p: InsurancePolicy) => p.premiumPayment !== null && p.premiumPayment.status !== PREMIUM_STATUS.FAILED;
export const premiumPaid = (p: InsurancePolicy) => p.premiumPayment?.status === PREMIUM_STATUS.COMPLETED;
