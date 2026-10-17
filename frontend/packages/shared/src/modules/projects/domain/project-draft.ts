// Domain types and pure rules for creating a project with quoted milestones.

export const PRODUCTION_TYPES = ["CAFE_ESPECIAL", "CACAO", "AGUACATE_HASS", "OTRO"] as const;
export type ProductionType = (typeof PRODUCTION_TYPES)[number];

const PRODUCTION_TYPE_LABELS: Record<ProductionType, string> = {
  CAFE_ESPECIAL: "Café especial",
  CACAO: "Cacao",
  AGUACATE_HASS: "Aguacate Hass",
  OTRO: "Otro",
};

// Legacy or free-text values (seed data stores plain names) fall back to the raw string.
export const productionTypeLabel = (value: string): string =>
  (PRODUCTION_TYPE_LABELS as Record<string, string>)[value] ?? value;

export interface NewMilestoneDraft {
  title: string;
  description: string;
  estimatedCompletionDate: string;
  suppliesBudget: number;
  laborBudget: number;
}

export interface ProjectDraft {
  title: string;
  description: string;
  productionType: ProductionType;
  startDate: string;
  estimatedEndDate: string;
  milestones: NewMilestoneDraft[];
  // RF-01: wallet address of the producer; the project form requires it, the transport accepts projects without it.
  producerWallet?: string;
  // RF-21 / D-05: contingency reserve in basis points (0 to 2000). The form defaults it to 5 % (500).
  contingencyBps?: number;
}

export const DEFAULT_CONTINGENCY_BPS = 500;
export const MAX_CONTINGENCY_PCT = 20;

// Validated input handed to the repository (after the zod schema).
export type CreateProjectInput = ProjectDraft;

export const milestoneQuotation = (m: Pick<NewMilestoneDraft, "suppliesBudget" | "laborBudget">): number =>
  m.suppliesBudget + m.laborBudget;

export const projectTargetAmount = (milestones: readonly Pick<NewMilestoneDraft, "suppliesBudget" | "laborBudget">[]): number =>
  milestones.reduce((sum, m) => sum + milestoneQuotation(m), 0);

// Position in the list defines the sequence (1-based).
export const withSequence = <T>(milestones: readonly T[]): (T & { sequenceOrder: number })[] =>
  milestones.map((m, i) => ({ ...m, sequenceOrder: i + 1 }));

// ISO yyyy-mm-dd strings compare lexicographically.
export const isDateWithin = (date: string, start: string, end: string): boolean => date >= start && date <= end;
