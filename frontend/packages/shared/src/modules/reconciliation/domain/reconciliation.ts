// Reconciliation (RF-17): the incoming payments seen on each beneficiary wallet (through a read grant) are matched against
// the receipts (comprobantes) the platform wrote. The platform never holds funds, so this is the proof that money went
// wallet to wallet. Amounts are integer minor units (RNF-10).

export const RECONCILIATION_STATUSES = ["CUADRA", "DIFERENCIA", "FALTA_COMPROBANTE", "SIN_COMPROBANTE"] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number] | "UNKNOWN";

export const ENTRY_SOURCES = ["GRANT_LINE", "SETTLEMENT_LINE", "INCOMING_ONLY"] as const;
export type EntrySource = (typeof ENTRY_SOURCES)[number] | "UNKNOWN";

// Append-only note left when an operator reviews a row.
export interface ReconciliationReview {
  id: string;
  at: string;
  actor: string;
  note: string;
}

export interface ReconciliationEntry {
  id: string;
  status: ReconciliationStatus;
  source: EntrySource;
  projectId: string | null;
  projectTitle: string;
  concept: string;
  beneficiaryName: string;
  beneficiaryWallet: string;
  currency: string;
  // Platform side: the receipt (what the platform says it paid) and the outgoing payment that produced it.
  receiptId: string | null;
  outgoingPaymentId: string | null;
  // Amount the beneficiary should receive according to the receipt (null when there is no receipt).
  receiptAmount: number | null;
  fee: number;
  // Total debited from the payer wallet (receipt amount + fee); null when there is no receipt.
  sentAmount: number | null;
  // Wallet side: the incoming payment read through the read grant (null when none was found).
  incomingPaymentId: string | null;
  incomingAmount: number | null;
  occurredAt: string;
  reviews: ReconciliationReview[];
}

export interface ReconciliationSummary {
  // Receipts the platform wrote (rows that are not wallet-only).
  receipts: number;
  matched: number;
  // Integer percentage of receipts that match (100 when there is nothing to match).
  matchedPct: number;
  different: number;
  missingIncoming: number;
  withoutReceipt: number;
  reviewed: number;
}

export const STATUS_LABEL: Record<ReconciliationStatus, string> = {
  CUADRA: "Cuadra",
  DIFERENCIA: "Diferencia",
  FALTA_COMPROBANTE: "Falta comprobante",
  SIN_COMPROBANTE: "Sin comprobante",
  UNKNOWN: "Estado desconocido",
};

export const STATUS_HELP: Record<ReconciliationStatus, string> = {
  CUADRA: "El pago recibido en la billetera coincide con el comprobante.",
  DIFERENCIA: "El monto recibido no coincide con el del comprobante.",
  FALTA_COMPROBANTE: "Hay comprobante, pero no encontramos el pago recibido en la billetera del beneficiario.",
  SIN_COMPROBANTE: "La billetera recibió un pago que la plataforma no registró en ningún comprobante.",
  UNKNOWN: "No reconocemos este estado.",
};

// Pure matching rule. `receiptAmount`/`incomingAmount` are null when that side is absent.
export function classify(receiptAmount: number | null, incomingAmount: number | null): ReconciliationStatus {
  if (receiptAmount === null && incomingAmount === null) return "UNKNOWN";
  if (receiptAmount === null) return "SIN_COMPROBANTE";
  if (incomingAmount === null) return "FALTA_COMPROBANTE";
  return receiptAmount === incomingAmount ? "CUADRA" : "DIFERENCIA";
}

export function summarize(entries: readonly ReconciliationEntry[]): ReconciliationSummary {
  const withReceipt = entries.filter((e) => e.receiptAmount !== null);
  const matched = withReceipt.filter((e) => e.status === "CUADRA").length;
  return {
    receipts: withReceipt.length,
    matched,
    matchedPct: withReceipt.length === 0 ? 100 : Math.floor((matched * 100) / withReceipt.length),
    different: entries.filter((e) => e.status === "DIFERENCIA").length,
    missingIncoming: entries.filter((e) => e.status === "FALTA_COMPROBANTE").length,
    withoutReceipt: entries.filter((e) => e.status === "SIN_COMPROBANTE").length,
    reviewed: entries.filter((e) => e.reviews.length > 0).length,
  };
}

export interface BeneficiaryGroup {
  beneficiaryWallet: string;
  beneficiaryName: string;
  entries: ReconciliationEntry[];
}

// Rows per beneficiary wallet, beneficiaries with open anomalies first, then by name.
export function groupByBeneficiary(entries: readonly ReconciliationEntry[]): BeneficiaryGroup[] {
  const groups = new Map<string, BeneficiaryGroup>();
  for (const e of entries) {
    const group = groups.get(e.beneficiaryWallet) ?? { beneficiaryWallet: e.beneficiaryWallet, beneficiaryName: e.beneficiaryName, entries: [] };
    group.entries.push(e);
    groups.set(e.beneficiaryWallet, group);
  }
  const anomalies = (g: BeneficiaryGroup) => g.entries.filter((e) => e.status !== "CUADRA").length;
  return [...groups.values()]
    .map((g) => ({ ...g, entries: [...g.entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) }))
    .sort((a, b) => anomalies(b) - anomalies(a) || a.beneficiaryName.localeCompare(b.beneficiaryName));
}

export const REVIEW_ACTOR = "Operador de la plataforma";
