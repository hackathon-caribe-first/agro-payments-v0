// The motor's sheet (PRD v3 RF-06, RF-07, RF-30) as the web app reads it. Money in whole pesos (COP), rates in percent.

export interface Distribution {
  p10: number;
  median: number;
  p90: number;
}

export interface SheetMilestone {
  sequence: number;
  title: string;
  day: number;
  sharePct: number;
  budget: number;
  supplies: number;
  labor: number;
  fee: number;
  contingency: number;
}

export interface ExitScenario {
  exitRate: number;
  tirBasePct: number;
  tirPct: Distribution;
}

export interface CurrencySheet {
  currency: string;
  entryRate: number;
  equilibriumRate: number;
  exits: ExitScenario[];
}

export interface OfferReason {
  code: string;
  message: string;
}

export interface Offer {
  publishable: boolean;
  reasons: OfferReason[];
  offeredReturnPct: number;
  contractPricePerKg: number;
  minimumContractPricePerKg: number | null;
}

export interface SimulationSheet {
  id: string;
  projectId: string;
  preset: string | null;
  motorVersion: string;
  seed: number;
  runs: number;
  crop: string;
  currency: string;
  createdAt: string;
  level: string;
  score: number;
  capital: number;
  investorCapital: number;
  insurancePremium: number;
  milestones: SheetMilestone[];
  coverageBase: number;
  coverageStress: number;
  coverageMinBase: number;
  baseRecoveryPct: number;
  tirPct: Distribution;
  probCapitalLossPct: number;
  probValuePreservedPct: number;
  currencies: CurrencySheet[];
  offer: Offer;
}

export interface SimulationPreset {
  id: string;
  name: string;
  description: string;
  contractPricePerKg: number | null;
}

export interface RunSimulationInput {
  preset: string;
  contractPricePerKg?: number;
}
