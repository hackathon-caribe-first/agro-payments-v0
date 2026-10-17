// PRD v3 RF-04 purchase contract, RF-05 ISA policy, RF-14 premium from custody, RF-25 indemnity into custody, RF-09 contract.
// Money in whole pesos (prices may carry cents), as the /api speaks it.

export type PriceType = "fixed" | "formula";
export type ContractUnit = "kg" | "t";
export type ContractCurrency = "COP" | "USD";

export interface PurchaseContract {
  projectId: string;
  priceType: PriceType;
  pricePerUnit: number | null;
  floorPerUnit: number | null;
  ceilingPerUnit: number | null;
  priceReference: string | null;
  quantity: number;
  unit: ContractUnit;
  currency: ContractCurrency;
  // RF-32: a USD contract is stored, not settled yet.
  settles: boolean;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerWalletAddress: string;
  updatedAt: string;
}

export interface PurchaseContractInput {
  priceType: PriceType;
  pricePerUnit?: number;
  floorPerUnit?: number;
  ceilingPerUnit?: number;
  priceReference?: string;
  quantity: number;
  unit: ContractUnit;
  currency: ContractCurrency;
  buyerEmail: string;
  buyerWalletAddress: string;
}

export type PremiumStatus = "executing" | "completed" | "failed" | "UNKNOWN";

export interface PremiumPayment {
  id: string;
  amount: number;
  status: PremiumStatus;
  reference: string | null;
  outgoingPaymentId: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface InsurancePolicy {
  projectId: string;
  insurerName: string;
  insurerWalletAddress: string;
  beneficiary: string;
  source: "simulation" | "input" | "UNKNOWN";
  premium: number;
  subsidyPct: number;
  netPremium: number;
  thresholdPct: number;
  thresholdYieldKgPerHa: number;
  deductiblePct: number;
  hectares: number;
  expectedYieldKgPerHa: number;
  insuredPricePerKg: number;
  sumInsured: number;
  indexTrigger: number | null;
  indexExit: number | null;
  premiumPayment: PremiumPayment | null;
}

/** Without a simulation, premium and the insured terms are required; with one, the motor's figures win. */
export interface PolicyInput {
  insurerName: string;
  insurerWalletAddress: string;
  premium?: number;
  subsidyPct?: number;
  thresholdPct?: number;
  deductiblePct?: number;
  hectares?: number;
  expectedYieldKgPerHa?: number;
  insuredPricePerKg?: number;
  indexTrigger?: number;
  indexExit?: number;
}

export type ClaimTrigger = "yield" | "index";

export interface InsuranceClaim {
  id: string;
  trigger: ClaimTrigger | "UNKNOWN";
  observedValue: number;
  evidence: string;
  amount: number;
  status: "pending" | "confirmed" | "UNKNOWN";
  incomingPaymentUrl: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface ClaimInput {
  trigger: ClaimTrigger;
  observedValue: number;
  evidence: string;
}

export type PartyRole = "investor" | "fiduciaria" | "producer" | "buyer";

export interface ContractDocument {
  id: string;
  projectId: string;
  version: number;
  hash: string;
  body: string;
  status: "signed" | "pending_signatures";
  parties: { role: PartyRole; name: string; signed: boolean }[];
  signatures: { partyRole: PartyRole; signedAt: string }[];
  // What the current user may still sign as.
  signableRoles: PartyRole[];
  createdAt: string;
}

export const PARTY_LABELS: Record<PartyRole, string> = {
  investor: "Inversionista",
  fiduciaria: "Patrimonio autónomo (fiduciaria)",
  producer: "Productor",
  buyer: "Comprador",
};
