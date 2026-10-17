import type { GrantStatus } from "../../grants/domain/grant";

// Investor panel (RF-19): what each milestone grant allows, what was spent, and where the rest of the money is.
// Amounts are integer minor units (RNF-10). The platform never holds funds: whatever is not spent stays in the investor wallet.

export interface PanelGrant {
  id: string;
  status: GrantStatus;
  cap: number;
  spent: number;
  // What is still in the investor wallet under this grant; null when no spending permission exists (yet).
  remainingInWallet: number | null;
  tokenMasked: string | null;
}

export interface LineCounts {
  total: number;
  paid: number;
  pending: number;
  failed: number;
}

export interface PanelMilestone {
  id: string;
  sequenceOrder: number;
  title: string;
  cap: number;
  grant: PanelGrant | null;
  lines: LineCounts;
  // Integer percentage of the cap already spent (0..100).
  progressPct: number;
}

export interface PanelSettlement {
  id: string;
  status: string;
  total: number;
  paidLines: number;
  lines: number;
}

export interface PanelProject {
  id: string;
  title: string;
  currency: string;
  contractId: string | null;
  milestones: PanelMilestone[];
  cap: number;
  spent: number;
  remainingInWallet: number;
  progressPct: number;
  settlements: PanelSettlement[];
}

// One confirmed line payment (comprobante), already enriched with the project and milestone it belongs to.
export interface FeedItem {
  id: string;
  grantId: string;
  projectId: string;
  projectTitle: string;
  milestoneId: string;
  milestoneTitle: string;
  currency: string;
  concept: string;
  beneficiary: string;
  received: number;
  fee: number;
  debited: number;
  incomingPaymentId: string;
  outgoingPaymentId: string;
  createdAt: string;
}

export interface PanelTotals {
  currency: string;
  cap: number;
  spent: number;
  remainingInWallet: number;
  progressPct: number;
  paymentsConfirmed: number;
}

export interface InvestorPanel {
  projects: PanelProject[];
  feed: FeedItem[];
  totals: PanelTotals;
  // ISO instant at which the data was read (drives "Actualizado hace X s").
  generatedAt: string;
}

// Integer percentage, clamped to 0..100. A zero cap reads as 0 %.
export const progressPct = (spent: number, cap: number): number => (cap <= 0 ? 0 : Math.min(100, Math.max(0, Math.floor((spent * 100) / cap))));

// ACTIVE: cap minus spent. REVOKED: the closing proof (or the same arithmetic). Anything else holds no permission.
export function remainingInWallet(status: GrantStatus, cap: number, spent: number, proofRemaining: number | null): number | null {
  if (status === "ACTIVE") return Math.max(0, cap - spent);
  if (status === "REVOKED") return proofRemaining ?? Math.max(0, cap - spent);
  return null;
}

export const sumRemaining = (milestones: readonly PanelMilestone[]): number =>
  milestones.reduce((total, m) => total + (m.grant?.remainingInWallet ?? 0), 0);

// Newest first; ties broken by id so the order is stable between refreshes.
export const newestFirst = (a: Pick<FeedItem, "createdAt" | "id">, b: Pick<FeedItem, "createdAt" | "id">): number =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

// "Actualizado hace X s" (RNF-08): whole seconds between the read and now, never negative.
export const secondsSince = (isoInstant: string, now: number): number => {
  const then = Date.parse(isoInstant);
  return Number.isNaN(then) ? 0 : Math.max(0, Math.floor((now - then) / 1000));
};

export const GRANT_STATUS_LABEL: Record<GrantStatus, string> = {
  PENDING_APPROVAL: "Pendiente de aprobación",
  ACTIVE: "Vigente",
  REVOKED: "Revocado",
  DENIED: "Rechazado",
  EXPIRED: "Vencido",
  UNKNOWN: "Estado desconocido",
};
