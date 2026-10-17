import type { MilestoneGrant, GrantMilestoneRef } from "../../grants/domain/grant";
import type { LineKind, LineState, Settlement } from "../../harvest/domain/harvest";
import type { Contract, Proposal } from "../../investments/domain/investment";
import type { ProjectLines } from "../../payment-lines/application/payment-lines-repository";
import type { LineStatus, PaymentLine } from "../../payment-lines/domain/line";
import { mulDivFloor } from "../../payment-lines/domain/money";
import { remainingInWallet } from "../../panel/domain/panel";
import type { Project } from "../../projects/domain/project";

// RF-22: the producer's final account statement and the investor's investment balance, as plain data. Both are built by pure
// functions from the endpoints that already exist (project, settlements, milestone payment lines, grants, contract). Amounts are
// integer minor units (RNF-10). Unknown values degrade to "UNKNOWN" labels instead of breaking the document.

export const STATEMENT_KINDS = ["PRODUCER_FINAL", "INVESTOR_BALANCE"] as const;
export type StatementKind = (typeof STATEMENT_KINDS)[number];

export type StatementStatus = "PAID" | "PENDING" | "QUEUED" | "FAILED" | "UNKNOWN";

export const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  PAID: "Pagado",
  PENDING: "Pendiente",
  QUEUED: "En cola",
  FAILED: "Fallido",
  UNKNOWN: "Sin estado",
};

// SALE: the sale orders. DISTRIBUTION: how each sale was split. LABOR / SUPPLIER: milestone payment lines.
// GRANT: the spending permission of a milestone. RECEIVED: what the investor received from the sale.
export const STATEMENT_GROUPS = ["SALE", "DISTRIBUTION", "LABOR", "SUPPLIER", "GRANT", "RECEIVED"] as const;
export type StatementGroup = (typeof STATEMENT_GROUPS)[number];

export interface StatementLine {
  id: string;
  group: StatementGroup;
  label: string;
  // Beneficiary, buyer or grant state, whatever qualifies the row.
  detail: string;
  amount: number;
  // GRANT rows only: the cap and what never left the investor billetera.
  cap: number | null;
  remaining: number | null;
  status: StatementStatus | null;
  // Receipt (comprobante) id, or the id of the record the row comes from.
  reference: string | null;
  at: string | null;
}

export interface StatementTotal {
  key: string;
  label: string;
  // Signed: a negative result is a loss.
  amount: number;
  emphasis: boolean;
  // Shown instead of the formatted amount (e.g. "Sin contrato").
  text?: string;
}

export type PartyRole = "PRODUCER" | "INVESTOR" | "BUYER" | "PLATFORM";

export interface StatementParty {
  role: PartyRole;
  name: string;
}

export interface Statement {
  id: string;
  kind: StatementKind;
  project: { id: string; title: string; code: string; currency: string };
  period: { from: string | null; to: string | null };
  parties: StatementParty[];
  lines: StatementLine[];
  totals: StatementTotal[];
  // True once at least one sale order was liquidated.
  settled: boolean;
  // D-04: what the sales did not cover of capital + yield (0 when nothing was lost).
  shortfall: number;
  generatedAt: string;
}

export const PARTY_ROLE_LABEL: Record<PartyRole, string> = {
  PRODUCER: "Productor",
  INVESTOR: "Inversor",
  BUYER: "Comprador",
  PLATFORM: "Plataforma",
};

export const LINE_KIND_LABEL: Record<LineKind, string> = {
  PLATFORM_FEE: "Comisión de la Plataforma",
  INVESTOR_CAPITAL: "Capital del inversor",
  INVESTOR_YIELD: "Rendimiento pactado",
  PRODUCER_NET: "Utilidad neta del productor",
  UNKNOWN: "Línea de pago",
};

// Everything the builders read, already mapped to domain objects. Only `project` is mandatory.
export interface StatementSources {
  project: Project;
  settlements: Settlement[];
  lines: ProjectLines | null;
  grants: MilestoneGrant[];
  grantMilestones: GrantMilestoneRef[];
  proposal: Proposal | null;
  contract: Contract | null;
  generatedAt: string;
}

// ---- pure helpers ----------------------------------------------------------------------------------------------------

export const orderCode = (id: string): string => id.replace(/^ord-/i, "");

const SETTLEMENT_STATE: Record<LineState, StatementStatus> = {
  completado: "PAID",
  pendiente: "PENDING",
  en_cola: "QUEUED",
  fallido: "FAILED",
  desconocido: "UNKNOWN",
};

const PAYMENT_STATE: Record<LineStatus, StatementStatus> = {
  completado: "PAID",
  pendiente: "PENDING",
  en_cola: "QUEUED",
  fallido: "FAILED",
  desconocido: "UNKNOWN",
};

export const settlementLineStatus = (state: LineState): StatementStatus => SETTLEMENT_STATE[state] ?? "UNKNOWN";

const settlementStatus = (s: Settlement): StatementStatus =>
  s.status === "COMPLETED" ? "PAID" : s.status === "PROCESSING" ? "PENDING" : s.status === "PARTIAL_FAILURE" ? "FAILED" : "UNKNOWN";

// What a milestone payment line paid (the receipt) or will pay (fixed value, or a share of the milestone cap).
export function paymentLineAmount(line: PaymentLine, cap: number): number {
  if (line.receipt) return line.receipt.received;
  return line.amountMode === "percent" ? mulDivFloor(cap, line.value, 10_000) : line.value;
}

export const sum = (values: readonly number[]): number => values.reduce((total, v) => total + v, 0);

// Only confirmed payments count towards totals.
export const paidTotal = (lines: readonly StatementLine[], match: (line: StatementLine) => boolean): number =>
  sum(lines.filter((l) => l.status === "PAID" && match(l)).map((l) => l.amount));

const settlementKindTotal = (settlements: readonly Settlement[], kind: LineKind): number =>
  sum(settlements.flatMap((s) => s.lines).filter((l) => l.kind === kind && l.state === "completado").map((l) => l.amount));

const byCreatedAt = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt);

const total = (key: string, label: string, amount: number, emphasis = false): StatementTotal => ({ key, label, amount, emphasis });

function period(sources: StatementSources): Statement["period"] {
  const dates = sources.settlements.map((s) => s.createdAt).sort();
  const from = sources.project.startDate || null;
  const to = dates.length > 0 ? dates[dates.length - 1] : null;
  // The period never reads start after end: swap when the dates arrive reversed.
  if (from && to && Date.parse(from) > Date.parse(to)) return { from: to, to: from };
  return { from, to };
}

function producerName(sources: StatementSources): string {
  const fromSettlement = sources.settlements
    .flatMap((s) => s.lines)
    .find((l) => l.kind === "PRODUCER_NET" && l.beneficiaryName)?.beneficiaryName;
  return sources.contract?.producerName || sources.proposal?.producerName || fromSettlement || "Productor";
}

function investorName(sources: StatementSources): string {
  const fromSettlement = sources.settlements
    .flatMap((s) => s.lines)
    .find((l) => l.kind === "INVESTOR_CAPITAL" && l.beneficiaryName)?.beneficiaryName;
  return sources.contract?.investorName || sources.proposal?.investorName || fromSettlement || "Inversor";
}

function projectRef(sources: StatementSources): Statement["project"] {
  const { project } = sources;
  return { id: project.id, title: project.title || "Proyecto sin título", code: project.projectCode, currency: project.currency || "COP" };
}

function saleLines(settlements: readonly Settlement[]): StatementLine[] {
  return settlements.map((s) => ({
    id: `sale:${s.id}`,
    group: "SALE" as const,
    label: `Orden ${orderCode(s.orderId)}`,
    detail: s.buyerName || "Comprador",
    amount: s.total,
    cap: null,
    remaining: null,
    status: settlementStatus(s),
    reference: s.id,
    at: s.createdAt,
  }));
}

function distributionLines(settlements: readonly Settlement[], kinds: readonly LineKind[] | null, group: StatementGroup): StatementLine[] {
  return settlements.flatMap((s) =>
    s.lines
      .filter((l) => kinds === null || kinds.includes(l.kind))
      .map((l) => ({
        id: `${group.toLowerCase()}:${l.id}`,
        group,
        label: `${LINE_KIND_LABEL[l.kind]} · orden ${orderCode(s.orderId)}`,
        detail: l.beneficiaryName || "Beneficiario",
        amount: l.amount,
        cap: null,
        remaining: null,
        status: settlementLineStatus(l.state),
        reference: l.receiptId,
        at: l.executedAt,
      })),
  );
}

function milestonePaymentLines(lines: ProjectLines | null, role: "PRODUCER" | "SUPPLIER", group: "LABOR" | "SUPPLIER"): StatementLine[] {
  if (!lines) return [];
  return [...lines.milestones]
    .sort((a, b) => a.milestone.sequenceOrder - b.milestone.sequenceOrder)
    .flatMap(({ milestone, lines: milestoneLines }) =>
      milestoneLines
        .filter((l) => l.beneficiary.role === role)
        .map((l) => ({
          id: `${group.toLowerCase()}:${l.id}`,
          group,
          label: `Hito ${milestone.sequenceOrder} · ${milestone.title}`,
          detail: `${l.beneficiary.name || "Beneficiario"}${l.reference ? ` · ${l.reference}` : ""}`,
          amount: paymentLineAmount(l, milestone.cap),
          cap: null,
          remaining: null,
          status: PAYMENT_STATE[l.status] ?? "UNKNOWN",
          reference: l.receiptId ?? l.receipt?.outgoingPaymentId ?? null,
          at: null,
        })),
    );
}

const lossOf = (settlements: readonly Settlement[]): number => sum(settlements.filter((s) => s.loss).map((s) => s.shortfall));

// ---- producer final statement ----------------------------------------------------------------------------------------

export function buildProducerStatement(sources: StatementSources): Statement {
  const settlements = [...sources.settlements].sort(byCreatedAt);
  const lines: StatementLine[] = [
    ...saleLines(settlements),
    ...distributionLines(settlements, null, "DISTRIBUTION"),
    ...milestonePaymentLines(sources.lines, "PRODUCER", "LABOR"),
    ...milestonePaymentLines(sources.lines, "SUPPLIER", "SUPPLIER"),
  ];
  const gross = sum(settlements.map((s) => s.total));
  const net = settlementKindTotal(settlements, "PRODUCER_NET");
  const labor = paidTotal(lines, (l) => l.group === "LABOR");
  const supplier = paidTotal(lines, (l) => l.group === "SUPPLIER");
  return {
    id: `PRODUCER_FINAL:${sources.project.id}`,
    kind: "PRODUCER_FINAL",
    project: projectRef(sources),
    period: period(sources),
    parties: [
      { role: "PRODUCER", name: producerName(sources) },
      { role: "INVESTOR", name: investorName(sources) },
      ...[...new Set(settlements.map((s) => s.buyerName).filter(Boolean))].map((name) => ({ role: "BUYER" as const, name })),
      { role: "PLATFORM", name: "Surco" },
    ],
    lines,
    totals: [
      total("gross", "Venta bruta", gross),
      total("fee", "Comisión de la Plataforma", settlementKindTotal(settlements, "PLATFORM_FEE")),
      total("capital", "Capital pagado al inversor", settlementKindTotal(settlements, "INVESTOR_CAPITAL")),
      total("yield", "Rendimiento pagado al inversor", settlementKindTotal(settlements, "INVESTOR_YIELD")),
      total("net", "Utilidad neta del productor", net, true),
      total("labor", "Pagos de hitos recibidos (mano de obra)", labor),
      total("supplier", "Pagos a proveedores hechos por tu cuenta", supplier),
      total("received", "Total recibido por el productor", net + labor, true),
    ],
    settled: settlements.length > 0,
    shortfall: lossOf(settlements),
    generatedAt: sources.generatedAt,
  };
}

// ---- investor balance ------------------------------------------------------------------------------------------------

export const GRANT_STATE_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Pendiente de aprobación",
  ACTIVE: "Vigente",
  REVOKED: "Revocado",
  EXPIRED: "Vencido",
};

function grantLines(sources: StatementSources): StatementLine[] {
  const milestoneById = new Map(sources.grantMilestones.map((m) => [m.id, m]));
  return sources.grants
    .filter((g) => g.status !== "DENIED")
    .map((g) => ({ grant: g, milestone: milestoneById.get(g.milestoneId) }))
    .sort((a, b) => (a.milestone?.sequenceOrder ?? 0) - (b.milestone?.sequenceOrder ?? 0) || a.grant.createdAt.localeCompare(b.grant.createdAt))
    .map(({ grant: g, milestone }) => ({
      id: `grant:${g.id}`,
      group: "GRANT" as const,
      label: milestone ? `Hito ${milestone.sequenceOrder} · ${milestone.title}` : "Hito",
      detail: GRANT_STATE_LABEL[g.status] ?? "Estado desconocido",
      amount: g.spent,
      cap: g.capAmount,
      remaining: remainingInWallet(g.status, g.capAmount, g.spent, g.revocation?.remainingInWallet ?? null),
      status: null,
      reference: g.id,
      at: g.revokedAt ?? g.approvedAt,
    }));
}

export function buildInvestorBalance(sources: StatementSources): Statement {
  const settlements = [...sources.settlements].sort(byCreatedAt);
  const grants = grantLines(sources);
  const received = distributionLines(settlements, ["INVESTOR_CAPITAL", "INVESTOR_YIELD"], "RECEIVED");
  const first = settlements[0];

  const holding = grants.filter((l) => l.remaining !== null);
  const cap = sum(holding.map((l) => l.cap ?? 0));
  const spent = sum(holding.map((l) => l.amount));
  const inWallet = sum(holding.map((l) => l.remaining ?? 0));

  // Contract terms first; seeded projects without a contract fall back to the first settlement, then to what was spent.
  const noContract = !sources.contract && !first;
  const invested = noContract ? 0 : (sources.contract?.amount ?? first?.capitalDue ?? 0);
  const agreedYield = sources.contract ? mulDivFloor(sources.contract.amount, sources.contract.yieldBps, 10_000) : (first?.yieldDue ?? 0);
  const capitalReceived = settlementKindTotal(settlements, "INVESTOR_CAPITAL");
  const yieldReceived = settlementKindTotal(settlements, "INVESTOR_YIELD");
  const totalReceived = capitalReceived + yieldReceived;
  const settled = settlements.length > 0;

  const totals: StatementTotal[] = [
    noContract ? { ...total("invested", "Monto del contrato", 0), text: "Sin contrato" } : total("invested", "Monto del contrato", invested),
    total("agreed-yield", "Rendimiento pactado", agreedYield),
    total("cap", "Tope autorizado en los hitos", cap),
    total("spent", "Gastado en los hitos", spent),
    total("wallet", "Sigue en tu billetera", inWallet),
    total("capital", "Capital recibido de la venta", capitalReceived),
    total("yield", "Rendimiento recibido de la venta", yieldReceived),
    total("received", "Total recibido de la venta", totalReceived),
  ];
  if (settled) totals.push(total("result", totalReceived - invested >= 0 ? "Resultado: ganancia" : "Resultado: pérdida", totalReceived - invested, true));

  return {
    id: `INVESTOR_BALANCE:${sources.project.id}`,
    kind: "INVESTOR_BALANCE",
    project: projectRef(sources),
    period: period(sources),
    parties: [
      { role: "INVESTOR", name: investorName(sources) },
      { role: "PRODUCER", name: producerName(sources) },
      { role: "PLATFORM", name: "Surco" },
    ],
    lines: [...grants, ...received],
    totals,
    settled,
    shortfall: lossOf(settlements),
    generatedAt: sources.generatedAt,
  };
}
