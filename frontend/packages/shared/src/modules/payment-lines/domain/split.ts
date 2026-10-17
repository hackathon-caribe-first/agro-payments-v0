import {
  AMOUNT_MODES,
  MOMENT_ORDER,
  PRODUCER_BENEFICIARY,
  idempotencyKey,
  type Beneficiary,
  type LineConcept,
  type LineStatus,
  type PaymentLine,
  type PaymentMoment,
} from "./line";
import { BPS_DENOMINATOR, formatAmount, mulDivFloor } from "./money";

// ---------------------------------------------------------------------------------------------------------------------
// Pure split rules ("Reglas de cálculo" of the PRD). Integer arithmetic on minimal units only (RNF-10).
// ---------------------------------------------------------------------------------------------------------------------

// Estimated commission per outgoing payment, in minimal units of each currency (EUR is observed at 1.00 = 100 at scale 2;
// in production it comes from the payer's ASE). Test-visible: pass your own table to `commissionPerPayment`.
export const COMMISSION_PER_PAYMENT: Readonly<Record<string, number>> = { COP: 0, EUR: 100 };

export const commissionPerPayment = (currency: string, table: Readonly<Record<string, number>> = COMMISSION_PER_PAYMENT): number =>
  table[currency] ?? 0;

export interface SplitContext {
  milestoneId: string;
  // Milestone maximum budget = the grant cap, in minimal units.
  cap: number;
  currency: string;
  scale: number;
  // Estimated commission of ONE payment, in minimal units.
  feePerPayment: number;
  // RF-21 / D-05: the contingency reserve, INSIDE the cap. Only lines of concept `imprevisto` can spend it; every other line
  // must fit in `cap - reserve`. Absent (or 0) when the project defined no reserve.
  reserve?: number;
}

// The reserve of a milestone: `contingencyBps` of its budget, floored (integer math).
export const reserveOf = (cap: number, contingencyBps: number | null | undefined): number =>
  contingencyBps && contingencyBps > 0 ? Math.min(cap, mulDivFloor(cap, contingencyBps, BPS_DENOMINATOR)) : 0;

// D-06: the platform commission of a milestone: `platformFeeBps` of its budget, floored (integer math).
export const platformCommissionOf = (cap: number, platformFeeBps: number | null | undefined): number =>
  platformFeeBps && platformFeeBps > 0 ? mulDivFloor(cap, platformFeeBps, BPS_DENOMINATOR) : 0;

export const splitContextOf = (milestone: {
  id: string;
  cap: number;
  currency: string;
  scale: number;
  contingencyBps?: number | null;
}): SplitContext => ({
  milestoneId: milestone.id,
  cap: milestone.cap,
  currency: milestone.currency,
  scale: milestone.scale,
  feePerPayment: commissionPerPayment(milestone.currency),
  reserve: reserveOf(milestone.cap, milestone.contingencyBps),
});

export type SplitWarningCode = "over_cap" | "over_reserve" | "below_minimum" | "below_commission" | "deferred" | "rounding_unassigned";

export interface SplitWarning {
  code: SplitWarningCode;
  message: string;
  lineIds: string[];
}

export interface PlannedPayment {
  // The anchor line: the first line of the group. Its id names the payment.
  anchorLineId: string;
  // RF-11: milestoneId:lineId of the anchor.
  idempotencyKey: string;
  lineIds: string[];
  beneficiary: Beneficiary;
  moment: PaymentMoment;
  concept: LineConcept;
  receive: number;
  commission: number;
  debit: number;
  status: LineStatus;
  // Moments this payment absorbed because their own amount did not exceed the commission.
  deferredFrom: PaymentMoment[];
}

export interface LineBreakdown {
  receive: number;
  // Only the anchor line of a consolidated payment carries the commission.
  commission: number;
  debit: number;
  // Anchor line id when this line is paid inside another line's payment; null otherwise.
  consolidatedInto: string | null;
  // Moment at which the line is actually paid (later than its own when deferred); null when the line is not created.
  paidAt: PaymentMoment | null;
}

export interface SplitPreview {
  payments: PlannedPayment[];
  byLine: Record<string, LineBreakdown>;
  cap: number;
  sumReceive: number;
  sumCommission: number;
  totalDebit: number;
  // RF-21: what ordinary lines may use (cap - reserve) and what they use; the reserve and what `imprevisto` lines use of it.
  ordinaryCap: number;
  ordinaryDebit: number;
  reserve: number;
  reserveUsed: number;
  reserveAvailable: number;
  // Debit of payments already completed.
  paidDebit: number;
  // Rule 6: what is not planned stays in the investor wallet. Never the producer's.
  unspent: number;
  overBy: number;
  warnings: SplitWarning[];
}

const money = (ctx: SplitContext, amount: number) => formatAmount(amount, ctx.currency, ctx.scale);

export const minimumUnitText = (ctx: Pick<SplitContext, "currency" | "scale">) => formatAmount(1, ctx.currency, ctx.scale);

// Rules 1 and 5: what each line receives. Fixed lines receive exactly their value; percent lines are a share of the cap,
// floored; the cents lost to flooring go to the producer line.
export function resolveReceives(ctx: SplitContext, lines: readonly PaymentLine[]) {
  const receives = new Map<string, number>();
  let percentBps = 0;
  let flooredSum = 0;
  for (const line of lines) {
    if (line.amountMode === "percent") {
      const share = mulDivFloor(ctx.cap, line.value, BPS_DENOMINATOR);
      receives.set(line.id, share);
      percentBps += line.value;
      flooredSum += share;
    } else {
      receives.set(line.id, line.value);
    }
  }
  const leftover = percentBps > 0 ? Math.max(0, mulDivFloor(ctx.cap, percentBps, BPS_DENOMINATOR) - flooredSum) : 0;
  let recipient: PaymentLine | undefined;
  if (leftover > 0) {
    const producers = lines.filter((l) => l.beneficiary.role === "PRODUCER");
    recipient = producers.find((l) => l.amountMode === "percent") ?? producers[0];
    if (recipient) receives.set(recipient.id, (receives.get(recipient.id) ?? 0) + leftover);
  }
  return { receives, leftover, leftoverRecipientId: recipient?.id ?? null };
}

interface Group {
  lineIds: string[];
  beneficiary: Beneficiary;
  moment: PaymentMoment;
  concepts: LineConcept[];
  receive: number;
  status: LineStatus;
  deferredFrom: PaymentMoment[];
  consolidable: boolean;
}

export function previewSplit(ctx: SplitContext, lines: readonly PaymentLine[]): SplitPreview {
  const warnings: SplitWarning[] = [];
  const { receives, leftover, leftoverRecipientId } = resolveReceives(ctx, lines);

  if (leftover > 0 && leftoverRecipientId === null) {
    warnings.push({
      code: "rounding_unassigned",
      message: `Quedan ${money(ctx, leftover)} por el redondeo de los porcentajes y no hay una línea del productor que los reciba. Siguen en la billetera del inversor.`,
      lineIds: lines.filter((l) => l.amountMode === "percent").map((l) => l.id),
    });
  }

  // Rule 3: pending lines of the same beneficiary and moment are paid as one. Lines already in a final or queued state stay apart.
  const groups: Group[] = [];
  const index = new Map<string, Group>();
  const byLine: Record<string, LineBreakdown> = {};
  for (const line of lines) {
    const receive = receives.get(line.id) ?? 0;
    byLine[line.id] = { receive, commission: 0, debit: receive, consolidatedInto: null, paidAt: null };
    // Rule 4: below the smallest unit the line is not created.
    if (receive < 1) {
      byLine[line.id].debit = 0;
      warnings.push({
        code: "below_minimum",
        message: `Una línea de ${line.beneficiary.name} queda por debajo de la unidad mínima (${minimumUnitText(ctx)}) y no se crea.`,
        lineIds: [line.id],
      });
      continue;
    }
    const consolidable = line.status === "pendiente";
    // Reserve lines never merge with ordinary ones: the reserve is accounted for apart (RF-21).
    const key = consolidable ? `${line.concept === "imprevisto" ? "reserve|" : ""}${line.beneficiary.id}|${line.moment}` : `line|${line.id}`;
    let group = index.get(key);
    if (!group) {
      group = { lineIds: [], beneficiary: line.beneficiary, moment: line.moment, concepts: [], receive: 0, status: line.status, deferredFrom: [], consolidable };
      index.set(key, group);
      groups.push(group);
    }
    group.lineIds.push(line.id);
    group.concepts.push(line.concept);
    group.receive += receive;
  }

  // Rule 4: a pending payment that does not exceed the commission is paid together with the same beneficiary's next moment.
  const fee = ctx.feePerPayment;
  const removed = new Set<Group>();
  if (fee > 0) {
    const ordered = [...groups].sort((a, b) => MOMENT_ORDER[a.moment] - MOMENT_ORDER[b.moment]);
    for (const group of ordered) {
      if (!group.consolidable || group.receive > fee) continue;
      const next = ordered.find(
        (g) =>
          g !== group &&
          !removed.has(g) &&
          g.consolidable &&
          g.beneficiary.id === group.beneficiary.id &&
          g.concepts.includes("imprevisto") === group.concepts.includes("imprevisto") &&
          MOMENT_ORDER[g.moment] > MOMENT_ORDER[group.moment],
      );
      if (next) {
        next.lineIds = [...group.lineIds, ...next.lineIds];
        next.concepts = [...group.concepts, ...next.concepts];
        next.receive += group.receive;
        next.deferredFrom = [...group.deferredFrom, group.moment, ...next.deferredFrom];
        removed.add(group);
        warnings.push({
          code: "deferred",
          message: `El pago a ${group.beneficiary.name} no supera la comisión estimada (${money(ctx, fee)}): se paga junto con el momento «${next.moment}».`,
          lineIds: group.lineIds,
        });
      } else {
        warnings.push({
          code: "below_commission",
          message: `El pago a ${group.beneficiary.name} no supera la comisión estimada (${money(ctx, fee)}). Súmalo a otra línea del mismo beneficiario o a un momento posterior.`,
          lineIds: group.lineIds,
        });
      }
    }
  }

  const payments: PlannedPayment[] = groups
    .filter((g) => !removed.has(g))
    .map((g) => {
      const anchorLineId = g.lineIds[0];
      return {
        anchorLineId,
        idempotencyKey: idempotencyKey(ctx.milestoneId, anchorLineId),
        lineIds: g.lineIds,
        beneficiary: g.beneficiary,
        moment: g.moment,
        concept: g.concepts.every((c) => c === g.concepts[0]) ? g.concepts[0] : "factura",
        receive: g.receive,
        commission: fee,
        debit: g.receive + fee,
        status: g.status,
        deferredFrom: g.deferredFrom,
      };
    })
    .sort((a, b) => MOMENT_ORDER[a.moment] - MOMENT_ORDER[b.moment]);

  for (const payment of payments) {
    for (const lineId of payment.lineIds) {
      const entry = byLine[lineId];
      const isAnchor = lineId === payment.anchorLineId;
      entry.commission = isAnchor ? payment.commission : 0;
      entry.debit = entry.receive + entry.commission;
      entry.consolidatedInto = isAnchor ? null : payment.anchorLineId;
      entry.paidAt = payment.moment;
    }
  }

  const sumReceive = payments.reduce((sum, p) => sum + p.receive, 0);
  const sumCommission = payments.reduce((sum, p) => sum + p.commission, 0);
  const totalDebit = sumReceive + sumCommission;
  const paidDebit = payments.filter((p) => p.status === "completado").reduce((sum, p) => sum + p.debit, 0);

  // RF-21: ordinary lines live in `cap - reserve`; only `imprevisto` payments draw from the reserve.
  const reserve = Math.min(ctx.cap, Math.max(0, ctx.reserve ?? 0));
  const ordinaryCap = ctx.cap - reserve;
  const reserveUsed = payments.filter((p) => p.concept === "imprevisto").reduce((sum, p) => sum + p.debit, 0);
  const ordinaryDebit = totalDebit - reserveUsed;
  const overOrdinary = Math.max(0, ordinaryDebit - ordinaryCap);
  const overReserve = Math.max(0, reserveUsed - reserve);
  const overBy = overOrdinary + overReserve;
  if (overOrdinary > 0) {
    warnings.push({
      code: "over_cap",
      message:
        reserve > 0
          ? `Las líneas superan el tope disponible del hito (${money(ctx, ordinaryCap)}, sin el fondo de imprevistos) por ${money(ctx, overOrdinary)}. Reduce montos o quita líneas antes de pagar.`
          : `Las líneas superan el tope del hito por ${money(ctx, overOrdinary)}. Reduce montos o quita líneas antes de pagar.`,
      lineIds: [],
    });
  }
  if (overReserve > 0) {
    warnings.push({
      code: "over_reserve",
      message: `Los imprevistos superan el fondo del hito (${money(ctx, reserve)}) por ${money(ctx, overReserve)}.`,
      lineIds: [],
    });
  }

  return {
    payments,
    byLine,
    cap: ctx.cap,
    sumReceive,
    sumCommission,
    totalDebit,
    ordinaryCap,
    ordinaryDebit,
    reserve,
    reserveUsed,
    reserveAvailable: Math.max(0, reserve - reserveUsed),
    paidDebit,
    unspent: Math.max(0, ctx.cap - totalDebit),
    overBy,
    warnings,
  };
}

// ---- Rule 2: the cap -------------------------------------------------------------------------------------------------

export type CapCheck =
  | { ok: true; preview: SplitPreview }
  | { ok: false; overBy: number; available: number; message: string; preview: SplitPreview };

// Σ recibe + Σ comisión estimada ≤ presupuesto máximo. Run on define AND on every added invoice, before any payment exists.
export function checkCap(ctx: SplitContext, lines: readonly PaymentLine[]): CapCheck {
  const preview = previewSplit(ctx, lines);
  if (preview.overBy === 0) return { ok: true, preview };
  return {
    ok: false,
    overBy: preview.overBy,
    available: 0,
    message: `No cabe en el tope del hito: las líneas suman ${money(ctx, preview.totalDebit)} y el tope es ${money(ctx, ctx.cap)}.`,
    preview,
  };
}

// Would adding `candidate` (or replacing the line with the same id) still fit? The rejection names the exact overflow.
export function canAddLine(ctx: SplitContext, existing: readonly PaymentLine[], candidate: PaymentLine): CapCheck {
  const others = existing.filter((l) => l.id !== candidate.id);
  const before = previewSplit(ctx, others);
  const after = previewSplit(ctx, [...others, candidate]);
  if (after.overBy === 0) return { ok: true, preview: after };
  // RF-21: an `imprevisto` line draws from the reserve; every other one from the cap without the reserve.
  if (candidate.concept === "imprevisto") {
    const available = before.reserveAvailable;
    return {
      ok: false,
      overBy: after.overBy,
      available,
      message: `No cabe en el fondo de imprevistos: supera ${money(ctx, after.overBy)} lo reservado (${money(ctx, after.reserve)}). Disponible: ${money(ctx, available)}. No se pidió ningún pago.`,
      preview: after,
    };
  }
  const available = Math.max(0, before.ordinaryCap - before.ordinaryDebit);
  const reserveNote = after.reserve > 0 ? ` El fondo de imprevistos (${money(ctx, after.reserve)}) queda aparte.` : "";
  return {
    ok: false,
    overBy: after.overBy,
    available,
    message: `No cabe en el tope del hito: supera ${money(ctx, after.overBy)} el presupuesto máximo (${money(ctx, after.ordinaryCap)}). Disponible para esta línea: ${money(ctx, available)}.${reserveNote} No se pidió ningún pago.`,
    preview: after,
  };
}

// ---- Rule 4: the smallest payable amount -----------------------------------------------------------------------------

// Field-level problem of one line value, or null.
export function lineValueProblem(ctx: SplitContext, mode: PaymentLine["amountMode"], value: number): string | null {
  if (!AMOUNT_MODES.includes(mode)) return "Selecciona cómo se define el monto.";
  if (!Number.isSafeInteger(value) || value < 1) {
    return mode === "percent" ? "El porcentaje debe estar entre 0,01 % y 100 %." : `El monto debe ser de al menos ${minimumUnitText(ctx)}.`;
  }
  if (mode === "percent") {
    if (value > BPS_DENOMINATOR) return "El porcentaje debe estar entre 0,01 % y 100 %.";
    if (mulDivFloor(ctx.cap, value, BPS_DENOMINATOR) < 1) return `Ese porcentaje queda por debajo de la unidad mínima (${minimumUnitText(ctx)}) y la línea no se crea.`;
  }
  return null;
}

// ---- The PRD example (hito 2, fertilización, EUR 1,000.00) -----------------------------------------------------------

export function prdExample(): { ctx: SplitContext; lines: PaymentLine[] } {
  const ctx: SplitContext = { milestoneId: "hito-2", cap: 100000, currency: "EUR", scale: 2, feePerPayment: commissionPerPayment("EUR") };
  const supplier = (id: string, name: string): Beneficiary => ({ role: "SUPPLIER", id, name, walletAddress: `https://eu1.fynbos.dev/${id}` });
  const base = { milestoneId: ctx.milestoneId, amountMode: "fixed", status: "pendiente", receiptId: null, createdAt: "2026-01-01T00:00:00Z" } as const;
  const lines: PaymentLine[] = [
    { ...base, id: "l1", beneficiary: supplier("proveedor-a", "Proveedor A"), concept: "factura", reference: "F-118", value: 60000, moment: "insumos" },
    { ...base, id: "l2", beneficiary: supplier("proveedor-b", "Proveedor B"), concept: "orden", reference: "T-07", value: 12000, moment: "insumos" },
    {
      ...base,
      id: "l3",
      beneficiary: { ...PRODUCER_BENEFICIARY, walletAddress: "https://eu1.fynbos.dev/productor" },
      concept: "mano_de_obra",
      reference: "",
      value: 23000,
      moment: "aprobacion",
    },
  ];
  return { ctx, lines };
}
