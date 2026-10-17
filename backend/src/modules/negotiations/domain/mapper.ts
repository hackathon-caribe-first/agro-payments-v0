// Ported from frontend/packages/shared/src/modules/presales/infrastructure/mapper.ts (wire → domain only), plus toFieldErrors
// from milestones/schemas/evidence-log.ts. The mock runs every rule on these domain objects, so the server does too.
import type { z } from "zod";
import { FORM_LEVEL_KEY, type FieldErrors } from "../../../shared/domain-errors";
import { DEPOSIT_STATUSES } from "./ledger";
import {
  ACTORS,
  HISTORY_KINDS,
  KNOWN_OPEN_REQUEST_STATUSES,
  KNOWN_QUOTE_STATUSES,
  KNOWN_REQUEST_STATUSES,
  NEGOTIATION_SCOPES,
  ORIGINS,
  UNITS,
  type Actor,
  type HistoryEntry,
  type NegotiationScope,
  type OfferTerms,
  type OpenRequest,
  type QuoteRequest,
  type SaleQuote,
} from "./presale";
import { saleQuoteTotal } from "./presale-rules";
import type { HistoryEntryDto, OpenRequestDto, QuoteRequestDto, SaleQuoteDto } from "./wire";

function toKnown<K extends string>(raw: string, known: readonly K[]): K | "UNKNOWN" {
  return (known as readonly string[]).includes(raw) ? (raw as K) : "UNKNOWN";
}

function termsFromDto(dto: SaleQuoteDto, scope: NegotiationScope | null): OfferTerms {
  if (scope === "MILESTONE") return { kind: "MILESTONE", price: dto.unit_price, deliveryDate: dto.delivery_date ?? "", notes: dto.notes ?? "" };
  if (scope === "PROJECT") {
    return {
      kind: "PROJECT",
      quantity: dto.quantity,
      unit: toKnown(dto.unit ?? "", UNITS),
      rawUnit: dto.unit ?? "",
      unitPrice: dto.unit_price,
      deliveryDate: dto.delivery_date ?? "",
      validUntil: dto.valid_until ?? "",
      notes: dto.notes ?? dto.delivery_terms ?? "",
    };
  }
  return {
    kind: "SALE",
    quantity: dto.quantity,
    unitPrice: dto.unit_price,
    deliveryDate: dto.delivery_date ?? null,
    validUntil: dto.valid_until ?? null,
    deliveryTerms: dto.delivery_terms ?? "",
  };
}

const quoteFromDto = (dto: SaleQuoteDto, scope: NegotiationScope | null): SaleQuote => ({
  requestId: dto.request_id,
  revision: dto.revision,
  author: toKnown(dto.author ?? "PRODUCER", ACTORS) as Actor,
  unit: dto.unit ? toKnown(dto.unit, UNITS) : null,
  rawUnit: dto.unit ?? "",
  notes: dto.notes ?? "",
  terms: termsFromDto(dto, scope),
  unitPrice: dto.unit_price,
  quantity: dto.quantity,
  total: saleQuoteTotal(dto.quantity, dto.unit_price),
  currency: dto.currency,
  deliveryDate: dto.delivery_date ?? null,
  validUntil: scope === "MILESTONE" ? null : (dto.valid_until ?? null),
  deliveryTerms: dto.delivery_terms ?? dto.notes ?? "",
  status: toKnown(dto.status, KNOWN_QUOTE_STATUSES),
  createdAt: dto.created_at,
});

const historyFromDto = (dto: HistoryEntryDto): HistoryEntry => ({
  id: dto.id,
  actor: toKnown(dto.actor, ACTORS),
  type: dto.type,
  kind: toKnown(dto.type, HISTORY_KINDS),
  from: dto.from,
  to: dto.to,
  at: dto.at,
  payload: dto.payload,
});

function scopeFromDto(dto: QuoteRequestDto, origin: string): NegotiationScope | null {
  if (dto.scope) return toKnown(dto.scope, NEGOTIATION_SCOPES);
  return origin === "OPEN_REQUEST" ? null : "PROJECT";
}

export function toQuoteRequest(dto: QuoteRequestDto): QuoteRequest {
  const origin = toKnown(dto.origin ?? "PROJECT_INTEREST", ORIGINS);
  const scope = scopeFromDto(dto, origin);
  return {
    id: dto.id,
    origin,
    openRequestId: dto.open_request_id ?? null,
    scope,
    milestoneId: dto.milestone_id ?? null,
    targetId: dto.milestone_id ?? dto.project_id,
    projectId: dto.project_id,
    producerId: dto.producer_id ?? null,
    producerName: dto.producer_name ?? "",
    buyerId: dto.buyer_id,
    buyerName: dto.buyer_name,
    quantity: dto.quantity,
    desiredDeliveryDate: dto.desired_delivery_date,
    notes: dto.notes,
    status: toKnown(dto.status, KNOWN_REQUEST_STATUSES),
    rawStatus: dto.status,
    createdAt: dto.created_at,
    quotes: dto.quotes.map((q) => quoteFromDto(q, scope)),
    history: [...dto.history].map(historyFromDto).sort((a, b) => a.at.localeCompare(b.at)),
    deposit: dto.deposit_status
      ? {
          status: toKnown(dto.deposit_status, DEPOSIT_STATUSES),
          agreedTotal: dto.agreed_total ?? 0,
          depositedAt: dto.deposited_at ?? null,
          ledgerEntryId: dto.ledger_entry_id ?? null,
        }
      : null,
  };
}

export const toOpenRequest = (dto: OpenRequestDto): OpenRequest => ({
  id: dto.id,
  buyerId: dto.buyer_id,
  buyerName: dto.buyer_name,
  title: dto.title,
  productionType: dto.production_type,
  quantity: dto.quantity,
  unit: toKnown(dto.unit, UNITS),
  rawUnit: dto.unit,
  targetUnitPrice: dto.target_unit_price ?? null,
  currency: dto.currency,
  deliveryDate: dto.delivery_date,
  deliveryLocation: dto.delivery_location,
  notes: dto.notes,
  status: toKnown(dto.status, KNOWN_OPEN_REQUEST_STATUSES),
  rawStatus: dto.status,
  awardedQuantity: dto.awarded_quantity ?? 0,
  createdAt: dto.created_at,
});

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const keys = issue.code === "unrecognized_keys" ? issue.keys.map((k) => [...issue.path, k].join(".")) : [issue.path.join(".") || FORM_LEVEL_KEY];
    for (const key of keys) (out[key] ??= []).push(issue.code === "unrecognized_keys" ? "Campo no permitido." : issue.message);
  }
  return out;
}
