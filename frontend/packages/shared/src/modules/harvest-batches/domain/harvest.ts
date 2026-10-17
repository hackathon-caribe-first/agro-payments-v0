import type { ProjectStatus } from "../../projects/domain/project";

// Domain types for the harvest -> marketplace -> purchase order -> liquidation flow (PRD Fase 4).
// Amounts are integer COP (assetScale 0); weights are integer kilograms (RNF-10).

export const HARVEST_STATUSES = ["DECLARED_BY_PRODUCER", "CORRECTIONS_REQUESTED", "CERTIFIED_LISTED", "SOLD_OUT", "UNKNOWN"] as const;
export type HarvestStatus = (typeof HARVEST_STATUSES)[number];

export const ORDER_STATUSES = [
  "AWAITING_PAYMENT_AUTHORIZATION",
  "PAYMENT_AUTHORIZED",
  "DISPATCHED",
  "RECEIVED_CONFIRMED",
  "SETTLED",
  "CANCELLED",
  "UNKNOWN",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Lifecycle of the buyer's outgoing-payment grant for one order.
export const GRANT_STATES = ["NONE", "LIVE", "REVOKED_BY_BUYER", "REVOKED_AFTER_SETTLEMENT", "UNKNOWN"] as const;
export type GrantState = (typeof GRANT_STATES)[number];

export const LINE_STATES = ["pendiente", "completado", "fallido", "en_cola", "desconocido"] as const;
export type LineState = (typeof LINE_STATES)[number];

export const LINE_KINDS = ["PLATFORM_FEE", "INVESTOR_CAPITAL", "INVESTOR_YIELD", "PRODUCER_NET", "UNKNOWN"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const SETTLEMENT_STATUSES = ["PROCESSING", "COMPLETED", "PARTIAL_FAILURE", "UNKNOWN"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

// Dynamic quality payload (wire keys): humidity_pct, score, certification, plus whatever else a producer reports.
export type QualityMetrics = Record<string, string | number>;

export interface Certification {
  verifierName: string;
  comments: string;
  signatureHash: string;
  certifiedAt: string;
}

export interface HarvestBatch {
  id: string;
  projectId: string;
  projectTitle: string;
  productionType: string;
  producerId: string;
  producerName: string;
  status: HarvestStatus;
  declaredKg: number;
  certifiedKg: number | null;
  askingPricePerKg: number;
  // Kilograms still free to order (certified weight minus active orders).
  availableKg: number;
  // True while an order for this lot is in progress (one order at a time per lot).
  hasOpenOrder: boolean;
  currency: string;
  qualityMetrics: QualityMetrics;
  certifiedMetrics: QualityMetrics | null;
  notes: string;
  photoUrls: string[];
  declaredAt: string;
  correctionNotes: string | null;
  certification: Certification | null;
  // Investment terms of the project this harvest repays (seeded, the investments module is owned elsewhere).
  investorCapital: number;
  investorYieldPct: number;
  capitalOutstanding: number;
  yieldOutstanding: number;
}

export interface GrantInfo {
  state: GrantState;
  cap: number;
  approvedAt: string | null;
  revokedAt: string | null;
  revocationProof: string | null;
}

export interface Dispatch {
  trackingNumber: string;
  carrier: string;
  photoUrl: string;
  dispatchedAt: string;
}

export interface OrderEvent {
  status: OrderStatus;
  at: string;
}

export interface PurchaseOrder {
  id: string;
  batchId: string;
  projectId: string;
  projectTitle: string;
  productionType: string;
  buyerId: string;
  buyerName: string;
  producerId: string;
  producerName: string;
  quantityKg: number;
  unitPrice: number;
  total: number;
  currency: string;
  status: OrderStatus;
  grant: GrantInfo;
  dispatch: Dispatch | null;
  receivedAt: string | null;
  createdAt: string;
  events: OrderEvent[];
  // Terms frozen when the order was created (what the liquidation of this order owes the investor).
  capitalDue: number;
  yieldDue: number;
  platformFeeBp: number;
}

export interface SettlementLine {
  id: string;
  kind: LineKind;
  beneficiaryName: string;
  amount: number;
  state: LineState;
  incomingPaymentId: string | null;
  outgoingPaymentId: string | null;
  receiptId: string | null;
  executedAt: string | null;
}

export interface RevocationProof {
  revokedAt: string;
  responseStatus: number;
  cap: number;
  spent: number;
  remaining: number;
}

export interface Settlement {
  id: string;
  orderId: string;
  projectId: string;
  projectTitle: string;
  buyerName: string;
  currency: string;
  total: number;
  platformFeeBp: number;
  capitalDue: number;
  yieldDue: number;
  status: SettlementStatus;
  // D-04: the sale did not cover capital + yield, so the investor absorbed the loss.
  loss: boolean;
  shortfall: number;
  lines: SettlementLine[];
  revocation: RevocationProof | null;
  createdAt: string;
}

export interface OrderDetail {
  order: PurchaseOrder;
  settlement: Settlement | null;
}

export interface ProjectSummary {
  id: string;
  title: string;
  productionType: string;
  currentStatus: ProjectStatus | "UNKNOWN";
  currency: string;
}

export interface MilestoneProgress {
  id: string;
  title: string;
  sequenceOrder: number;
  status: string;
}

export interface DeclarationContext {
  project: ProjectSummary;
  milestones: MilestoneProgress[];
  batches: HarvestBatch[];
}

const METRIC_LABELS: Record<string, string> = {
  humidity_pct: "Humedad (%)",
  score: "Puntaje de calidad",
  certification: "Certificación",
};

export function metricLabel(key: string): string {
  if (METRIC_LABELS[key]) return METRIC_LABELS[key];
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatKg(kg: number): string {
  return `${new Intl.NumberFormat("es-CO").format(kg)} kg`;
}
