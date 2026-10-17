import { BoundaryError } from "../../milestones/domain/errors";
import { PROJECT_STATUSES, type ProjectStatus } from "../../projects/domain/project";
import {
  GRANT_STATES,
  HARVEST_STATUSES,
  LINE_KINDS,
  LINE_STATES,
  ORDER_STATUSES,
  SETTLEMENT_STATUSES,
  type DeclarationContext,
  type HarvestBatch,
  type OrderDetail,
  type PurchaseOrder,
  type Settlement,
} from "../domain/harvest";
import type { DeclareHarvestInput } from "../schemas/declare-harvest";
import type { CertifyHarvestInput } from "../schemas/certify-harvest";
import type { DispatchOrderInput } from "../schemas/order-forms";
import {
  declarationContextDtoSchema,
  harvestBatchDtoSchema,
  orderDetailDtoSchema,
  orderDtoSchema,
  settlementDtoSchema,
  type DeclarationContextDto,
  type HarvestBatchDto,
  type OrderDetailDto,
  type OrderDto,
  type SettlementDto,
} from "./dto";
import { z } from "zod";

// Unknown wire values never crash the UI: they map to an explicit UNKNOWN member.
function pick<T extends readonly string[]>(values: T, raw: string, fallback: T[number]): T[number] {
  return (values as readonly string[]).includes(raw) ? (raw as T[number]) : fallback;
}

function parse<S extends z.ZodType>(schema: S, raw: unknown, what: string): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new BoundaryError(`Unexpected ${what} payload`);
  return parsed.data;
}

function toBatchFromDto(dto: HarvestBatchDto): HarvestBatch {
  return {
    id: dto.id,
    projectId: dto.project_id,
    projectTitle: dto.project_title,
    productionType: dto.production_type,
    producerId: dto.producer_id,
    producerName: dto.producer_name,
    status: pick(HARVEST_STATUSES, dto.status, "UNKNOWN"),
    declaredKg: dto.declared_kg,
    certifiedKg: dto.certified_kg,
    askingPricePerKg: dto.asking_price_per_kg,
    availableKg: dto.available_kg,
    hasOpenOrder: dto.has_open_order,
    currency: dto.currency,
    qualityMetrics: dto.quality_metrics,
    certifiedMetrics: dto.certified_metrics,
    notes: dto.notes,
    photoUrls: dto.photo_urls,
    declaredAt: dto.declared_at,
    correctionNotes: dto.correction_notes,
    certification: dto.certification
      ? {
          verifierName: dto.certification.verifier_name,
          comments: dto.certification.comments,
          signatureHash: dto.certification.signature_hash,
          certifiedAt: dto.certification.certified_at,
        }
      : null,
    investorCapital: dto.investor_capital,
    investorYieldPct: dto.investor_yield_pct,
    capitalOutstanding: dto.capital_outstanding,
    yieldOutstanding: dto.yield_outstanding,
  };
}

function toOrderFromDto(dto: OrderDto): PurchaseOrder {
  return {
    id: dto.id,
    batchId: dto.batch_id,
    projectId: dto.project_id,
    projectTitle: dto.project_title,
    productionType: dto.production_type,
    buyerId: dto.buyer_id,
    buyerName: dto.buyer_name,
    producerId: dto.producer_id,
    producerName: dto.producer_name,
    quantityKg: dto.quantity_kg,
    unitPrice: dto.unit_price,
    total: dto.total,
    currency: dto.currency,
    status: pick(ORDER_STATUSES, dto.status, "UNKNOWN"),
    grant: {
      state: pick(GRANT_STATES, dto.grant.state, "UNKNOWN"),
      cap: dto.grant.cap,
      approvedAt: dto.grant.approved_at,
      revokedAt: dto.grant.revoked_at,
      revocationProof: dto.grant.revocation_proof,
    },
    dispatch: dto.dispatch
      ? {
          trackingNumber: dto.dispatch.tracking_number,
          carrier: dto.dispatch.carrier,
          photoUrl: dto.dispatch.photo_url,
          dispatchedAt: dto.dispatch.dispatched_at,
        }
      : null,
    receivedAt: dto.received_at,
    createdAt: dto.created_at,
    events: dto.events.map((e) => ({ status: pick(ORDER_STATUSES, e.status, "UNKNOWN"), at: e.at })),
    capitalDue: dto.capital_due,
    yieldDue: dto.yield_due,
    platformFeeBp: dto.platform_fee_bp,
  };
}

function toSettlementFromDto(dto: SettlementDto): Settlement {
  return {
    id: dto.id,
    orderId: dto.order_id,
    projectId: dto.project_id,
    projectTitle: dto.project_title,
    buyerName: dto.buyer_name,
    currency: dto.currency,
    total: dto.total,
    platformFeeBp: dto.platform_fee_bp,
    capitalDue: dto.capital_due,
    yieldDue: dto.yield_due,
    status: pick(SETTLEMENT_STATUSES, dto.status, "UNKNOWN"),
    loss: dto.loss,
    shortfall: dto.shortfall,
    lines: dto.lines.map((l) => ({
      id: l.id,
      kind: pick(LINE_KINDS, l.kind, "UNKNOWN"),
      beneficiaryName: l.beneficiary_name,
      amount: l.amount,
      state: pick(LINE_STATES, l.state, "desconocido"),
      incomingPaymentId: l.incoming_payment_id,
      outgoingPaymentId: l.outgoing_payment_id,
      receiptId: l.receipt_id,
      executedAt: l.executed_at,
    })),
    revocation: dto.revocation
      ? {
          revokedAt: dto.revocation.revoked_at,
          responseStatus: dto.revocation.response_status,
          cap: dto.revocation.cap,
          spent: dto.revocation.spent,
          remaining: dto.revocation.remaining,
        }
      : null,
    createdAt: dto.created_at,
  };
}

export const toBatch = (raw: unknown): HarvestBatch => toBatchFromDto(parse(harvestBatchDtoSchema, raw, "harvest batch"));
export const toBatches = (raw: unknown): HarvestBatch[] => parse(z.array(harvestBatchDtoSchema), raw, "harvest batches").map(toBatchFromDto);
export const toOrder = (raw: unknown): PurchaseOrder => toOrderFromDto(parse(orderDtoSchema, raw, "order"));
export const toOrders = (raw: unknown): PurchaseOrder[] => parse(z.array(orderDtoSchema), raw, "orders").map(toOrderFromDto);
export const toSettlements = (raw: unknown): Settlement[] => parse(z.array(settlementDtoSchema), raw, "settlements").map(toSettlementFromDto);

export function toOrderDetail(raw: unknown): OrderDetail {
  const dto: OrderDetailDto = parse(orderDetailDtoSchema, raw, "order detail");
  return { order: toOrderFromDto(dto.order), settlement: dto.settlement ? toSettlementFromDto(dto.settlement) : null };
}

export function toDeclarationContext(raw: unknown): DeclarationContext {
  const dto: DeclarationContextDto = parse(declarationContextDtoSchema, raw, "declaration context");
  const status = (PROJECT_STATUSES as readonly string[]).includes(dto.project.current_status) ? (dto.project.current_status as ProjectStatus) : "UNKNOWN";
  return {
    project: { id: dto.project.id, title: dto.project.title, productionType: dto.project.production_type, currentStatus: status, currency: dto.project.currency },
    milestones: dto.milestones.map((m) => ({ id: m.id, title: m.title, sequenceOrder: m.sequence_order, status: m.status })),
    batches: dto.batches.map(toBatchFromDto),
  };
}

export const toDeclareBody = (input: DeclareHarvestInput) => ({
  harvested_kg: input.harvestedKg,
  asking_price_per_kg: input.askingPricePerKg,
  quality_metrics: input.qualityMetrics,
  notes: input.notes,
  photo_urls: input.photoUrls,
});

export const toCertifyBody = (input: CertifyHarvestInput) => ({
  certified_kg: input.certifiedKg,
  certified_metrics: input.certifiedMetrics,
  comments: input.comments,
});

export const toDispatchBody = (input: DispatchOrderInput) => ({
  carrier: input.carrier,
  tracking_number: input.trackingNumber,
  photo_url: input.photoUrl,
});
