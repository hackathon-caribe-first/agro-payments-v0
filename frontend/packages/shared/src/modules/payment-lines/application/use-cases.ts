import { FORM_LEVEL_KEY, err, ok, type FieldErrors } from "../../milestones/domain/errors";
import { toFieldErrors } from "../../milestones/schemas/evidence-log";
import { PRODUCER_BENEFICIARY, canRetryPayment, isEditable, pendingRetryOf, type Beneficiary, type PaymentLine, type PendingRetry } from "../domain/line";
import { attemptLines, type PaymentLinesResult } from "../domain/errors";
import { buildContingencyInputSchema } from "../schemas/contingency";
import { canAddLine, lineValueProblem, prdExample, previewSplit, splitContextOf, type SplitContext, type SplitPreview } from "../domain/split";
import { walletProblem, type Supplier } from "../domain/supplier";
import { buildLineInputSchema, type LineInput } from "../schemas/line";
import { supplierInputSchema } from "../schemas/supplier";
import type { MilestoneLines, MilestoneRef, PaymentLinesRepository, SupplierPayment } from "./payment-lines-repository";

export interface PaymentLinesDeps {
  lines: PaymentLinesRepository;
}

const supplierBeneficiary = (supplier: Supplier): Beneficiary => ({
  role: "SUPPLIER",
  id: supplier.id,
  name: supplier.name,
  walletAddress: supplier.walletAddress,
});

// RF-01: the producer is paid at the billetera registered on the project; the fixed profile wallet is the fallback.
const producerBeneficiary = (milestone: Pick<MilestoneRef, "producerWallet">): Beneficiary => ({
  ...PRODUCER_BENEFICIARY,
  walletAddress: milestone.producerWallet ?? PRODUCER_BENEFICIARY.walletAddress,
});

// ---- suppliers (RF-08) ------------------------------------------------------------------------------------------------

export const listSuppliers = (deps: PaymentLinesDeps) =>
  attemptLines<Supplier[]>(async () => ok([...(await deps.lines.listSuppliers())].sort((a, b) => a.name.localeCompare(b.name, "es"))));

// Parse, validate the wallet through GET (exists, same currency as the project), then register.
export const createSupplier = (deps: PaymentLinesDeps, raw: unknown) =>
  attemptLines<Supplier>(async () => {
    const parsed = supplierInputSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    const validation = await deps.lines.validateWallet(parsed.data.walletAddress);
    const problem = walletProblem(validation);
    if (problem) return err({ kind: "validation", fieldErrors: { walletAddress: [problem] } });
    return ok(await deps.lines.createSupplier(parsed.data));
  });

// ---- what a supplier collects ("Mis cobros") --------------------------------------------------------------------------

export const listSupplierPayments = (deps: PaymentLinesDeps, supplierId: string) =>
  attemptLines<SupplierPayment[]>(async () => {
    const payments = await deps.lines.listSupplierPayments(supplierId);
    // Defensive: never show a line addressed to somebody else, whatever the transport returned.
    return ok(payments.filter((p) => p.line.beneficiary.id === supplierId));
  });

// ---- lines of one milestone (RF-02, RF-09) ----------------------------------------------------------------------------

export interface MilestoneLinesView extends MilestoneLines {
  ctx: SplitContext;
  preview: SplitPreview;
  // Who can be paid: validated suppliers plus the producer.
  beneficiaries: Beneficiary[];
}

export const getMilestoneLines = (deps: PaymentLinesDeps, milestoneId: string) =>
  attemptLines<MilestoneLinesView>(async () => {
    const found = await deps.lines.getMilestoneLines(milestoneId);
    if (!found) return err({ kind: "not_found" });
    const suppliers = await deps.lines.listSuppliers();
    const ctx = splitContextOf(found.milestone);
    return ok({
      ...found,
      ctx,
      preview: previewSplit(ctx, found.lines),
      beneficiaries: [producerBeneficiary(found.milestone), ...suppliers.filter((s) => s.status === "validado").map(supplierBeneficiary)],
    });
  });

// The payments of a milestone that are still open (queued or failed). Read-only and role-agnostic: it feeds the "pagos pendientes" banner
// of the producer, investor and verifier pages. Never fails the page: when the lines cannot be read, nothing is pending as far as it knows.
export const getPendingRetry = (deps: PaymentLinesDeps, milestoneId: string) =>
  attemptLines<PendingRetry>(async () => {
    const found = await deps.lines.getMilestoneLines(milestoneId);
    return ok(pendingRetryOf(found?.lines ?? []));
  });

// Same, for every milestone of a project, keyed by milestone id (the producer's project page).
export const getProjectPendingRetry = (deps: PaymentLinesDeps, projectId: string) =>
  attemptLines<Record<string, PendingRetry>>(async () => {
    const found = await deps.lines.getProjectLines(projectId);
    return ok(Object.fromEntries((found?.milestones ?? []).map((m) => [m.milestone.id, pendingRetryOf(m.lines)])));
  });

// Everything that can be checked without the server: shape, beneficiary vs concept, minimum unit and the cap.
type Checked = { ok: true; input: LineInput } | { ok: false; errors: FieldErrors };
const rejected = (errors: FieldErrors): Checked => ({ ok: false, errors });

function checkLine(view: MilestoneLinesView, raw: unknown, editingId: string | null): Checked {
  const parsed = buildLineInputSchema({ scale: view.ctx.scale }).safeParse(raw);
  if (!parsed.success) return rejected(toFieldErrors(parsed.error));
  const input = parsed.data;
  // `imprevisto` lines only exist through the contingency request and `comision` lines are planned by the platform.
  if (input.concept === "imprevisto" || input.concept === "comision") {
    return rejected({ concept: ["Este concepto no se agrega a mano. Usa el fondo de imprevistos del hito."] });
  }

  const beneficiary = view.beneficiaries.find((b) => b.id === input.beneficiaryId);
  if (!beneficiary) return rejected({ beneficiaryId: ["Selecciona un beneficiario con billetera validada."] });
  if (input.concept === "mano_de_obra" && beneficiary.role !== "PRODUCER") return rejected({ concept: ["La mano de obra se paga a la línea del productor."] });
  if (input.concept !== "mano_de_obra" && beneficiary.role === "PRODUCER") return rejected({ concept: ["Las facturas y órdenes se pagan a un proveedor."] });

  const problem = lineValueProblem(view.ctx, input.amountMode, input.value);
  if (problem) return rejected({ amount: [problem] });

  const candidate: PaymentLine = {
    id: editingId ?? "candidate",
    milestoneId: view.milestone.id,
    beneficiary,
    concept: input.concept,
    reference: input.reference,
    amountMode: input.amountMode,
    value: input.value,
    moment: input.moment,
    status: "pendiente",
    receiptId: null,
    createdAt: "",
  };
  // Rule 2: rejected before any payment is requested.
  const cap = canAddLine(view.ctx, view.lines, candidate);
  if (!cap.ok) return rejected({ amount: [cap.message] });
  return { ok: true, input };
}

export const addLine = (deps: PaymentLinesDeps, milestoneId: string, raw: unknown) =>
  attemptLines<PaymentLine>(async () => {
    const view = await getMilestoneLines(deps, milestoneId);
    if (!view.ok) return view;
    const checked = checkLine(view.value, raw, null);
    if (!checked.ok) return err({ kind: "validation", fieldErrors: checked.errors });
    return ok(await deps.lines.addLine(milestoneId, checked.input));
  });

export const updateLine = (deps: PaymentLinesDeps, milestoneId: string, lineId: string, raw: unknown) =>
  attemptLines<PaymentLine>(async () => {
    const view = await getMilestoneLines(deps, milestoneId);
    if (!view.ok) return view;
    const current = view.value.lines.find((l) => l.id === lineId);
    if (!current) return err({ kind: "not_found" });
    if (!isEditable(current)) return err({ kind: "line_locked" });
    const checked = checkLine(view.value, raw, lineId);
    if (!checked.ok) return err({ kind: "validation", fieldErrors: checked.errors });
    return ok(await deps.lines.updateLine(lineId, checked.input));
  });

export const removeLine = (deps: PaymentLinesDeps, milestoneId: string, lineId: string) =>
  attemptLines<void>(async () => {
    const found = await deps.lines.getMilestoneLines(milestoneId);
    const current = found?.lines.find((l) => l.id === lineId);
    if (!current) return err({ kind: "not_found" });
    if (!isEditable(current)) return err({ kind: "line_locked" });
    await deps.lines.removeLine(lineId);
    return ok(undefined);
  });

// ---- contingency reserve (RF-21 · D-05, "Quién genera cada solicitud" fila 6) ----------------------------------------------

// Creates a line of concept `imprevisto` (moment `insumos`) that only the reserve can fund. The engine pays it through the active
// grant like any other insumos line.
export const requestContingencyFunds = (deps: PaymentLinesDeps, milestoneId: string, raw: unknown) =>
  attemptLines<PaymentLine>(async () => {
    const view = await getMilestoneLines(deps, milestoneId);
    if (!view.ok) return view;
    const { ctx } = view.value;
    if (ctx.reserve === undefined || ctx.reserve <= 0) {
      return err({ kind: "validation", fieldErrors: { [FORM_LEVEL_KEY]: ["Este proyecto no definió un fondo de imprevistos."] } });
    }
    const parsed = buildContingencyInputSchema({ scale: ctx.scale }).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    const input = parsed.data;

    const beneficiary = view.value.beneficiaries.find((b) => b.id === input.beneficiaryId);
    if (!beneficiary) return err({ kind: "validation", fieldErrors: { beneficiaryId: ["Selecciona un beneficiario con billetera validada."] } });
    const problem = lineValueProblem(ctx, "fixed", input.value);
    if (problem) return err({ kind: "validation", fieldErrors: { amount: [problem] } });

    // The request must fit in what is still available of the reserve (payment + estimated commission).
    const candidate: PaymentLine = {
      id: "candidate",
      milestoneId,
      beneficiary,
      concept: "imprevisto",
      reference: input.reason,
      amountMode: "fixed",
      value: input.value,
      moment: "insumos",
      status: "pendiente",
      receiptId: null,
      createdAt: "",
    };
    const cap = canAddLine(ctx, view.value.lines, candidate);
    if (!cap.ok) return err({ kind: "validation", fieldErrors: { amount: [cap.message] } });
    return ok(await deps.lines.addLine(milestoneId, { beneficiaryId: input.beneficiaryId, concept: "imprevisto", reference: input.reason, amountMode: "fixed", value: input.value, moment: "insumos" }));
  });

// ---- retry (RF-11 · RF-07) ------------------------------------------------------------------------------------------------

// "Reintentar pago": only for queued or failed lines. Idempotent by `milestone:line`.
export const retryLinePayment = (deps: PaymentLinesDeps, milestoneId: string, lineId: string) =>
  attemptLines<PaymentLine>(async () => {
    const found = await deps.lines.getMilestoneLines(milestoneId);
    const current = found?.lines.find((l) => l.id === lineId);
    if (!current) return err({ kind: "not_found" });
    if (current.status === "completado") return err({ kind: "validation", fieldErrors: { [FORM_LEVEL_KEY]: ["Esta línea ya está pagada: no se envía un segundo pago."] } });
    if (!canRetryPayment(current)) return err({ kind: "validation", fieldErrors: { [FORM_LEVEL_KEY]: ["Solo se reintentan las líneas en cola o fallidas."] } });
    return ok(await deps.lines.retryPayment(milestoneId, lineId));
  });

// For the payment flows: the line was paid.
export const markLinePaid = (deps: PaymentLinesDeps, lineId: string) =>
  attemptLines<PaymentLine>(async () => ok(await deps.lines.markPaid(lineId)));

// ---- every milestone of a project -------------------------------------------------------------------------------------

export interface ProjectLinesRow {
  milestone: MilestoneRef;
  lineCount: number;
  ctx: SplitContext;
  preview: SplitPreview;
}

export const getProjectLines = (deps: PaymentLinesDeps, projectId: string) =>
  attemptLines<{ project: { id: string; title: string; projectCode: string }; rows: ProjectLinesRow[] }>(async () => {
    const found = await deps.lines.getProjectLines(projectId);
    if (!found) return err({ kind: "not_found" });
    const rows = [...found.milestones]
      .sort((a, b) => a.milestone.sequenceOrder - b.milestone.sequenceOrder)
      .map(({ milestone, lines }): ProjectLinesRow => {
        const ctx = splitContextOf(milestone);
        return { milestone, lineCount: lines.length, ctx, preview: previewSplit(ctx, lines) };
      });
    return ok({ project: found.project, rows });
  });

// ---- the PRD sample (hito 2, EUR 1,000.00) ----------------------------------------------------------------------------

export function getPrdExample(): PaymentLinesResult<{ ctx: SplitContext; lines: PaymentLine[]; preview: SplitPreview }> {
  const { ctx, lines } = prdExample();
  return ok({ ctx, lines, preview: previewSplit(ctx, lines) });
}
