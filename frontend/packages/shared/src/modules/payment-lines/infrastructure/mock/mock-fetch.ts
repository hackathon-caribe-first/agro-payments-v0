import { z } from "zod";
import { FORM_LEVEL_KEY, type FieldErrors } from "../../../milestones/domain/errors";
import { toFieldErrors } from "../../../milestones/schemas/evidence-log";
import type { RejectionBody } from "../../../projects/infrastructure/dto";
import type { PresalesMockStore } from "../../../presales/infrastructure/mock/store";
import type { MilestoneRef } from "../../application/payment-lines-repository";
import { PLATFORM_IDENTITY } from "../../../presales/infrastructure/mock/identities";
import { MAX_PAYMENT_ATTEMPTS, PRODUCER_BENEFICIARY, failureText, isEditable, retryDelayMs, type Beneficiary, type PaymentLine } from "../../domain/line";
import { canAddLine, lineValueProblem, platformCommissionOf, splitContextOf } from "../../domain/split";
import { SUPPLIER_CATEGORIES, walletProblem } from "../../domain/supplier";
import { supplierInputSchema } from "../../schemas/supplier";
import { attemptBodySchema, createLineBodySchema, createSupplierBodySchema, lineBodySchema, lineDtoSchema, type LineDto, type SupplierDto } from "../dto";
import { toLine } from "../mapper";
import { createLineFixtures, createSupplierFixtures } from "./fixtures";
import { lookupWallet } from "./wallet-registry";

// Optional body of mark-paid: the receipt of the grant payment that settled the line.
const receiptBodySchema = z.object({ receipt: lineDtoSchema.shape.receipt.unwrap().unwrap() });

type RejectionErrors =RejectionBody["errors"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const reject = (status: 400 | 409, errors: RejectionErrors) => json({ error: "Request rejected", errors }, status);
const invalid = (errors: FieldErrors) => reject(400, errors);
const conflict = (message: string, field: string = FORM_LEVEL_KEY) => reject(409, { [field]: [message] });
const malformed = () => invalid({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] });

const LOCKED_MESSAGE = "Solo se pueden editar o quitar líneas pendientes.";
const CLOSED_MESSAGE = "Este hito ya está cerrado: no admite más líneas.";

// D-06: platform commission per milestone, in basis points of the milestone budget. `platform_fee_pct` of the project (2.00 % by default).
const DEFAULT_COMMISSION_BPS = 200;
const commissionBps = (platformFeePct: number | null | undefined): number =>
  platformFeePct && platformFeePct > 0 ? Math.round(platformFeePct * 100) : DEFAULT_COMMISSION_BPS;

// The module's own state. Never added to the shared store types.
export interface PaymentLinesState {
  suppliers: SupplierDto[];
  lines: LineDto[];
}

export const createPaymentLinesState = (): PaymentLinesState => ({
  suppliers: createSupplierFixtures(),
  lines: createLineFixtures(),
});

// Endpoints (all anchored, none shadows /milestones/:id, /projects/:id or /projects/:id/milestones):
//   GET    /wallet-validation?url=
//   GET    /suppliers                       POST /suppliers
//   GET    /milestone-lines?milestone_id=   POST /milestone-lines
//   PATCH  /milestone-lines/:lineId         DELETE /milestone-lines/:lineId
//   POST   /milestone-lines/:lineId/mark-paid
//   GET    /projects/:projectId/milestone-lines
//   GET    /supplier/payments?supplier_id=
export function createPaymentLinesMockFetch(
  base: PresalesMockStore,
  delegate: typeof fetch,
  state: PaymentLinesState = createPaymentLinesState(),
): typeof fetch {
  let nextSupplier = state.suppliers.length + 1;
  let nextLine = state.lines.reduce((max, l) => Math.max(max, Number(l.id.replace(/\D/g, "")) || 0), 300) + 1;

  const readBody = (init?: RequestInit): unknown => {
    try {
      return JSON.parse(String(init?.body ?? "null"));
    } catch {
      return undefined;
    }
  };

  const allProjects = () => [...base.projects, ...base.externalProjects];

  // The cap of a milestone is its maximum budget: supplies + labor (COP, scale 0). The project terms (producer wallet, reserve,
  // commission rate) travel with it; projects created before them simply omit them.
  function milestoneRef(milestoneId: string): MilestoneRef | null {
    const m = base.milestones.find((x) => x.id === milestoneId);
    if (!m) return null;
    const project = allProjects().find((p) => p.id === m.project_id);
    const producerWallet = project?.producer_wallet_address ?? null;
    return {
      id: m.id,
      projectId: m.project_id,
      sequenceOrder: m.sequence_order,
      title: m.title,
      cap: m.supplies_budget + m.labor_budget,
      currency: m.currency,
      scale: 0,
      contingencyBps: project?.contingency_bps ?? null,
      // D-06: the commission is planned per milestone for projects that registered a producer wallet (the project form requires it).
      platformFeeBps: producerWallet ? commissionBps(project?.platform_fee_pct) : null,
      producerWallet,
      dueDate: m.estimated_completion_date ?? null,
      status: m.status,
    };
  }

  const milestoneDto = (m: MilestoneRef) => ({
    id: m.id,
    project_id: m.projectId,
    sequence_order: m.sequenceOrder,
    title: m.title,
    cap: m.cap,
    currency: m.currency,
    scale: m.scale,
    contingency_bps: m.contingencyBps ?? null,
    platform_fee_bps: m.platformFeeBps ?? null,
    producer_wallet: m.producerWallet ?? null,
    due_date: m.dueDate ?? null,
    status: m.status ?? null,
  });

  const linesOf = (milestoneId: string) => state.lines.filter((l) => l.milestone_id === milestoneId);

  // D-06: the platform commission is planned automatically as a non-editable split line (see `ensureCommission`). Idempotent.
  function ensureCommission(milestoneId: string): void {
    const ref = milestoneRef(milestoneId);
    if (!ref?.producerWallet || !ref.platformFeeBps || ref.status === "COMPLETED_AND_PAID") return;
    const id = `ln-fee-${milestoneId}`;
    if (state.lines.some((l) => l.id === id)) return;
    const value = platformCommissionOf(ref.cap, ref.platformFeeBps);
    if (value < 1) return;
    state.lines.push({
      id,
      milestone_id: milestoneId,
      beneficiary: { role: "PLATFORM", id: PLATFORM_IDENTITY.id, name: PLATFORM_IDENTITY.name, wallet_address: PLATFORM_IDENTITY.wallet },
      concept: "comision",
      reference: "",
      amount_mode: "FIXED",
      value,
      moment: "aprobacion",
      status: "PENDING",
      receipt_id: null,
      created_at: new Date().toISOString(),
    });
  }

  function beneficiaryOf(id: string, milestone?: MilestoneRef): Beneficiary | null {
    // RF-01: the producer is paid at the billetera registered on the project when there is one.
    if (id === PRODUCER_BENEFICIARY.id) return { ...PRODUCER_BENEFICIARY, walletAddress: milestone?.producerWallet ?? PRODUCER_BENEFICIARY.walletAddress };
    const s = state.suppliers.find((x) => x.id === id && x.status === "VALIDATED");
    return s ? { role: "SUPPLIER", id: s.id, name: s.name, walletAddress: s.wallet_address } : null;
  }

  const wireBeneficiary = (b: Beneficiary) => ({ role: b.role, id: b.id, name: b.name, wallet_address: b.walletAddress });

  // Shared by create and update. Returns the rejection, or the domain candidate that fits.
  function validateLine(
    milestone: MilestoneRef,
    body: ReturnType<typeof lineBodySchema.parse>,
    editingId: string | null,
  ): { response: Response } | { candidate: PaymentLine } {
    const ctx = splitContextOf(milestone);
    const beneficiary = beneficiaryOf(body.beneficiary_id, milestone);
    if (!beneficiary) return { response: invalid({ beneficiaryId: ["Selecciona un beneficiario con billetera validada."] }) };

    const candidate = (() => {
      try {
        // Reuse the wire mapper so enum fallbacks behave exactly as on a read.
        return toLine({
          id: editingId ?? "candidate",
          milestone_id: milestone.id,
          beneficiary: wireBeneficiary(beneficiary),
          concept: body.concept,
          reference: body.reference,
          amount_mode: body.amount_mode,
          value: Math.max(0, body.value),
          moment: body.moment,
          status: "PENDING",
          created_at: new Date().toISOString(),
        });
      } catch {
        return null;
      }
    })();
    if (!candidate) return { response: malformed() };

    // `comision` is planned by the platform; `imprevisto` can go to a supplier or to the producer (RF-21).
    if (candidate.concept === "comision") return { response: invalid({ concept: ["La comisión de la plataforma la planea el sistema."] }) };
    if (candidate.concept === "mano_de_obra" && beneficiary.role !== "PRODUCER") return { response: invalid({ concept: ["La mano de obra se paga a la línea del productor."] }) };
    if ((candidate.concept === "factura" || candidate.concept === "orden") && beneficiary.role === "PRODUCER") return { response: invalid({ concept: ["Las facturas y órdenes se pagan a un proveedor."] }) };

    const problem = lineValueProblem(ctx, candidate.amountMode, body.value);
    if (problem) return { response: invalid({ amount: [problem] }) };

    const existing = linesOf(milestone.id).map((l) => toLine(l));
    const duplicate = (candidate.concept === "factura" || candidate.concept === "orden") && existing.some((l) => l.id !== editingId && l.beneficiary.id === beneficiary.id && l.concept === candidate.concept && l.reference.toLowerCase() === candidate.reference.toLowerCase());
    if (duplicate) return { response: conflict("Esta factura u orden ya está cargada para este proveedor.", "reference") };

    const cap = canAddLine(ctx, existing, candidate);
    if (!cap.ok) return { response: invalid({ amount: [cap.message] }) };
    return { candidate };
  }

  const fromCandidate = (candidate: PaymentLine, body: ReturnType<typeof lineBodySchema.parse>): Pick<LineDto, "beneficiary" | "concept" | "reference" | "amount_mode" | "value" | "moment"> => ({
    beneficiary: wireBeneficiary(candidate.beneficiary),
    concept: candidate.concept,
    reference: candidate.reference,
    amount_mode: candidate.amountMode,
    value: body.value,
    moment: candidate.moment,
  });

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");

    // --- wallet validation: GET <wallet address> ---
    if (method === "GET" && path === "/wallet-validation") {
      const lookup = lookupWallet(url.searchParams.get("url") ?? "");
      if (lookup.kind === "invalid") return invalid({ walletAddress: [lookup.message] });
      const { exists, assetCode, assetScale, publicName } = lookup.validation;
      return json({ exists, asset_code: assetCode, asset_scale: assetScale, public_name: publicName });
    }

    // --- suppliers ---
    if (method === "GET" && path === "/suppliers") return json(state.suppliers);

    if (method === "POST" && path === "/suppliers") {
      const dto = createSupplierBodySchema.safeParse(readBody(init));
      if (!dto.success) return malformed();
      const parsed = supplierInputSchema.safeParse({ name: dto.data.name, category: dto.data.category, walletAddress: dto.data.wallet_address });
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));
      const lookup = lookupWallet(parsed.data.walletAddress);
      if (lookup.kind === "invalid") return invalid({ walletAddress: [lookup.message] });
      const problem = walletProblem(lookup.validation);
      if (problem) return invalid({ walletAddress: [problem] });
      if (state.suppliers.some((s) => s.wallet_address === lookup.url)) return conflict("Ya registraste un proveedor con esta billetera.", "walletAddress");

      const created: SupplierDto = {
        id: `sup-${nextSupplier++}`,
        name: parsed.data.name,
        category: SUPPLIER_CATEGORIES.find((c) => c === parsed.data.category) ?? "otro",
        wallet_address: lookup.url,
        asset_code: lookup.validation.assetCode,
        asset_scale: lookup.validation.assetScale,
        public_name: lookup.validation.publicName,
        status: "VALIDATED",
        created_at: new Date().toISOString(),
      };
      state.suppliers.push(created);
      return json(created, 201);
    }

    // --- the payments received by one supplier, across projects ---
    if (method === "GET" && path === "/supplier/payments") {
      const supplierId = url.searchParams.get("supplier_id") ?? "";
      const payments = state.lines
        .filter((l) => l.beneficiary.role === "SUPPLIER" && l.beneficiary.id === supplierId)
        .flatMap((l) => {
          const m = milestoneRef(l.milestone_id);
          const project = m ? allProjects().find((p) => p.id === m.projectId) : undefined;
          if (!m || !project) return [];
          return [
            {
              line: l,
              milestone: { id: m.id, title: m.title, sequence_order: m.sequenceOrder, currency: m.currency, scale: m.scale },
              project: { id: project.id, title: project.title, project_code: project.project_code },
            },
          ];
        });
      return json(payments);
    }

    // --- the lines of one milestone ---
    if (method === "GET" && path === "/milestone-lines") {
      ensureCommission(url.searchParams.get("milestone_id") ?? "");
      const milestone = milestoneRef(url.searchParams.get("milestone_id") ?? "");
      return milestone ? json({ milestone: milestoneDto(milestone), lines: linesOf(milestone.id) }) : json({ error: "Milestone not found" }, 404);
    }

    if (method === "POST" && path === "/milestone-lines") {
      const dto = createLineBodySchema.safeParse(readBody(init));
      if (!dto.success) return malformed();
      const milestone = milestoneRef(dto.data.milestone_id);
      if (!milestone) return json({ error: "Milestone not found" }, 404);
      const status = base.milestones.find((m) => m.id === milestone.id)?.status;
      if (status === "COMPLETED_AND_PAID") return conflict(CLOSED_MESSAGE);
      ensureCommission(milestone.id);
      const checked = validateLine(milestone, dto.data, null);
      if ("response" in checked) return checked.response;

      const created: LineDto = {
        id: `ln-${nextLine++}`,
        milestone_id: milestone.id,
        ...fromCandidate(checked.candidate, dto.data),
        status: "PENDING",
        receipt_id: null,
        created_at: new Date().toISOString(),
      };
      state.lines.push(created);
      return json(created, 201);
    }

    const lineMatch = path.match(/^\/milestone-lines\/([^/]+)$/);
    if (lineMatch && (method === "PATCH" || method === "DELETE")) {
      const current = state.lines.find((l) => l.id === lineMatch[1]);
      if (!current) return json({ error: "Line not found" }, 404);
      if (!isEditable(toLine(current))) return conflict(LOCKED_MESSAGE);

      if (method === "DELETE") {
        state.lines.splice(state.lines.indexOf(current), 1);
        return json({ ok: true });
      }
      const dto = lineBodySchema.safeParse(readBody(init));
      if (!dto.success) return malformed();
      const milestone = milestoneRef(current.milestone_id);
      if (!milestone) return json({ error: "Milestone not found" }, 404);
      const checked = validateLine(milestone, dto.data, current.id);
      if ("response" in checked) return checked.response;
      Object.assign(current, fromCandidate(checked.candidate, dto.data));
      return json(current);
    }

    // Called by the payment flows once the outgoing payment of the line is confirmed.
    const paid = path.match(/^\/milestone-lines\/([^/]+)\/mark-paid$/);
    if (method === "POST" && paid) {
      const current = state.lines.find((l) => l.id === paid[1]);
      if (!current) return json({ error: "Line not found" }, 404);
      if (current.status !== "COMPLETED") {
        const tries = (current.attempts ?? 0) + 1;
        current.history = [
          ...(current.history ?? []),
          { at: new Date().toISOString(), type: "PAID", message: tries > 1 ? `Pago confirmado en el intento ${tries}.` : "Pago confirmado." },
        ];
      }
      current.status = "COMPLETED";
      current.next_attempt_at = null;
      current.receipt_id ??= `rcp-${current.id}`;
      const detail = receiptBodySchema.safeParse(readBody(init));
      if (detail.success) current.receipt = detail.data.receipt;
      return json(current);
    }

    // RF-11: the engine reports that an attempt to pay the line failed. A network or 5xx failure queues the line and schedules the
    // next attempt with exponential backoff (at most MAX_PAYMENT_ATTEMPTS); a business error (cap, revoked grant) never retries.
    const attempted = path.match(/^\/milestone-lines\/([^/]+)\/attempt$/);
    if (method === "POST" && attempted) {
      const current = state.lines.find((l) => l.id === attempted[1]);
      if (!current) return json({ error: "Line not found" }, 404);
      const body = attemptBodySchema.safeParse(readBody(init));
      if (!body.success) return malformed();
      if (current.status === "COMPLETED") return conflict("Esta línea ya está pagada.");
      const now = Date.now();
      const at = new Date(now).toISOString();
      const attempts = (current.attempts ?? 0) + 1;
      const history = [...(current.history ?? [])];
      const who = body.data.manual ? "Reintento manual" : "Intento";
      const code = body.data.code;
      // Raw codes never reach the visible text: they travel in `code` for the trace area.
      const reason = failureText(code) ?? body.data.message;
      current.attempts = attempts;
      if (!body.data.retryable) {
        current.status = "FAILED";
        current.next_attempt_at = null;
        history.push({ at, type: "REJECTED", message: `${who} rechazado: ${reason}`, code });
      } else if (attempts >= MAX_PAYMENT_ATTEMPTS) {
        current.status = "FAILED";
        current.next_attempt_at = null;
        history.push({ at, type: "ATTEMPT_FAILED", message: `${who} ${attempts} de ${MAX_PAYMENT_ATTEMPTS} falló: ${reason}`, code });
        history.push({ at, type: "RETRIES_EXHAUSTED", message: "Se agotaron los reintentos automáticos. Puedes reintentar el pago a mano." });
      } else {
        const delay = retryDelayMs(attempts);
        current.status = "QUEUED";
        current.next_attempt_at = new Date(now + delay).toISOString();
        history.push({ at, type: "ATTEMPT_FAILED", message: `${who} ${attempts} de ${MAX_PAYMENT_ATTEMPTS} falló: ${reason}`, code });
        history.push({ at, type: "RETRY_SCHEDULED", message: `Reintento automático programado (espera de ${Math.round(delay / 1000)} s).` });
      }
      current.history = history;
      return json(current);
    }

    // --- every milestone of a project ---
    const projectMatch = path.match(/^\/projects\/([^/]+)\/milestone-lines$/);
    if (method === "GET" && projectMatch) {
      const project = allProjects().find((p) => p.id === projectMatch[1]);
      if (!project) return json({ error: "Project not found" }, 404);
      const milestones = base.milestones
        .filter((m) => m.project_id === project.id)
        .sort((a, b) => a.sequence_order - b.sequence_order)
        .flatMap((m) => {
          ensureCommission(m.id);
          const ref = milestoneRef(m.id);
          return ref ? [{ milestone: milestoneDto(ref), lines: linesOf(m.id) }] : [];
        });
      return json({ project: { id: project.id, title: project.title, project_code: project.project_code }, milestones });
    }

    return delegate(input, init);
  };
}
