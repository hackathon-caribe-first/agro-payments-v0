import { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import type { MilestoneLines, MilestoneRef, ProjectLines, SupplierPayment } from "../application/payment-lines-repository";
import { AMOUNT_MODES, LINE_CONCEPTS, LINE_EVENT_TYPES, LINE_STATUSES, PAYMENT_MOMENTS, type AmountMode, type Beneficiary, type LineConcept, type LineStatus, type PaymentLine, type PaymentMoment } from "../domain/line";
import { SUPPLIER_CATEGORIES, type Supplier, type SupplierCategory, type SupplierStatus, type WalletValidation } from "../domain/supplier";
import {
  lineDtoSchema,
  milestoneLinesDtoSchema,
  projectLinesDtoSchema,
  supplierDtoSchema,
  supplierPaymentDtoSchema,
  walletValidationDtoSchema,
  type LineDto,
  type MilestoneLinesDto,
  type SupplierDto,
} from "./dto";

function parse<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new BoundaryError(`Unexpected ${what} payload`);
  return result.data;
}

const oneOf = <T extends string>(values: readonly T[], raw: string): T | undefined => values.find((v) => v === raw);

const STATUS_BY_WIRE: Record<string, LineStatus> = { PENDING: "pendiente", COMPLETED: "completado", FAILED: "fallido", QUEUED: "en_cola" };
const SUPPLIER_STATUS_BY_WIRE: Record<string, SupplierStatus> = { VALIDATED: "validado", PENDING: "pendiente", REJECTED: "rechazado" };

export const LINE_STATUS_TO_WIRE: Record<(typeof LINE_STATUSES)[number], string> = {
  pendiente: "PENDING",
  completado: "COMPLETED",
  fallido: "FAILED",
  en_cola: "QUEUED",
};

// Unknown wire values never crash the page: a status becomes "desconocido"; the rest fall back to the safest reading
// (a moment we do not know is treated as the last one, so it is never paid early).
const toMoment = (raw: string): PaymentMoment => oneOf(PAYMENT_MOMENTS, raw) ?? "liquidacion";
const toConcept = (raw: string): LineConcept => oneOf(LINE_CONCEPTS, raw) ?? "factura";
const toMode = (raw: string): AmountMode => oneOf(AMOUNT_MODES, raw) ?? "fixed";

export const toLine = (data: unknown): PaymentLine => fromLineDto(parse(lineDtoSchema, data, "payment line"));

function fromLineDto(dto: LineDto): PaymentLine {
  const beneficiary: Beneficiary = {
    role: dto.beneficiary.role === "PRODUCER" ? "PRODUCER" : dto.beneficiary.role === "PLATFORM" ? "PLATFORM" : "SUPPLIER",
    id: dto.beneficiary.id,
    name: dto.beneficiary.name,
    walletAddress: dto.beneficiary.wallet_address,
  };
  return {
    id: dto.id,
    milestoneId: dto.milestone_id,
    beneficiary,
    concept: toConcept(dto.concept),
    reference: dto.reference,
    amountMode: toMode(dto.amount_mode),
    value: dto.value,
    moment: toMoment(dto.moment),
    status: STATUS_BY_WIRE[dto.status] ?? "desconocido",
    receiptId: dto.receipt_id ?? null,
    receipt: dto.receipt
      ? {
          outgoingPaymentId: dto.receipt.outgoing_payment_id,
          incomingPaymentId: dto.receipt.incoming_payment_id,
          received: dto.receipt.received,
          fee: dto.receipt.fee,
          debited: dto.receipt.debited,
        }
      : null,
    createdAt: dto.created_at,
    attempts: dto.attempts ?? 0,
    nextAttemptAt: dto.next_attempt_at ?? null,
    history: (dto.history ?? []).map((e) => ({ at: e.at, type: oneOf(LINE_EVENT_TYPES, e.type) ?? "UNKNOWN", message: e.message, code: e.code ?? null })),
  };
}

function fromMilestoneLinesDto(dto: MilestoneLinesDto): MilestoneLines {
  const m = dto.milestone;
  const milestone: MilestoneRef = {
    id: m.id,
    projectId: m.project_id,
    sequenceOrder: m.sequence_order,
    title: m.title,
    cap: m.cap,
    currency: m.currency,
    scale: m.scale,
    contingencyBps: m.contingency_bps ?? null,
    platformFeeBps: m.platform_fee_bps ?? null,
    producerWallet: m.producer_wallet ?? null,
    dueDate: m.due_date ?? null,
    status: m.status ?? null,
  };
  return { milestone, lines: dto.lines.map(fromLineDto) };
}

export const toMilestoneLines = (data: unknown): MilestoneLines => fromMilestoneLinesDto(parse(milestoneLinesDtoSchema, data, "milestone lines"));

export function toProjectLines(data: unknown): ProjectLines {
  const dto = parse(projectLinesDtoSchema, data, "project lines");
  return {
    project: { id: dto.project.id, title: dto.project.title, projectCode: dto.project.project_code },
    milestones: dto.milestones.map(fromMilestoneLinesDto),
  };
}

function fromSupplierDto(dto: SupplierDto): Supplier {
  return {
    id: dto.id,
    name: dto.name,
    category: oneOf<SupplierCategory>(SUPPLIER_CATEGORIES, dto.category) ?? "otro",
    walletAddress: dto.wallet_address,
    assetCode: dto.asset_code,
    assetScale: dto.asset_scale,
    publicName: dto.public_name,
    status: SUPPLIER_STATUS_BY_WIRE[dto.status] ?? "desconocido",
    createdAt: dto.created_at,
  };
}

export const toSupplier = (data: unknown): Supplier => fromSupplierDto(parse(supplierDtoSchema, data, "supplier"));
export const toSuppliers = (data: unknown): Supplier[] => parse(z.array(supplierDtoSchema), data, "supplier list").map(fromSupplierDto);

export function toWalletValidation(data: unknown): WalletValidation {
  const dto = parse(walletValidationDtoSchema, data, "wallet validation");
  return { exists: dto.exists, assetCode: dto.asset_code, assetScale: dto.asset_scale, publicName: dto.public_name };
}

export function toSupplierPayments(data: unknown): SupplierPayment[] {
  return parse(z.array(supplierPaymentDtoSchema), data, "supplier payments").map((dto) => ({
    line: fromLineDto(dto.line),
    milestone: { id: dto.milestone.id, title: dto.milestone.title, sequenceOrder: dto.milestone.sequence_order, currency: dto.milestone.currency, scale: dto.milestone.scale },
    project: { id: dto.project.id, title: dto.project.title, projectCode: dto.project.project_code },
  }));
}
