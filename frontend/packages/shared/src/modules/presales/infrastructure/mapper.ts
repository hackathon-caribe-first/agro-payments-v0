import { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import {
  ACTORS,
  HISTORY_KINDS,
  NEGOTIATION_SCOPES,
  KNOWN_OPEN_REQUEST_STATUSES,
  KNOWN_QUOTE_STATUSES,
  KNOWN_REQUEST_STATUSES,
  ORIGINS,
  UNITS,
  type Actor,
  type CatalogProject,
  type HistoryEntry,
  type NegotiationScope,
  type OfferTerms,
  type OpenRequest,
  type QuoteRequest,
  type SaleQuote,
} from "../domain/presale";
import { AUTHORIZATION_STATES } from "../../payment-authorization/domain/authorization";
import { toProject } from "../../projects/infrastructure/mapper";
import { saleQuoteTotal } from "../domain/presale-rules";
import type { PartyIdentity, StartTarget } from "../application/presale-repository";
import type { MilestoneTermsInput } from "../schemas/start-milestone-negotiation";
import type { ProjectTermsInput } from "../schemas/start-project-negotiation";
import type { CreateOpenRequestInput } from "../schemas/create-open-request";
import type { StartOpenRequestNegotiationInput } from "../schemas/start-open-request-negotiation";
import {
  catalogProjectDtoSchema,
  openRequestDtoSchema,
  quoteRequestDtoSchema,
  type CreateOpenRequestDto,
  type HistoryEntryDto,
  type OpenRequestDto,
  type QuoteRequestDto,
  type RespondRequestDto,
  type SaleQuoteDto,
  type StartNegotiationDto,
  type StartOpenRequestNegotiationDto,
} from "./dto";

function parse<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid ${what}: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

// Unknown values degrade to a safe fallback instead of failing the whole response.
function toKnown<K extends string>(raw: string, known: readonly K[]): K | "UNKNOWN" {
  return (known as readonly string[]).includes(raw) ? (raw as K) : "UNKNOWN";
}

// The terms of an offer by the scope of its negotiation. Milestone offers travel as unit_price = price, quantity = 1.
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
  // Offers from before authorship existed were always the producer's.
  author: toKnown(dto.author ?? "PRODUCER", ACTORS) as Actor,
  unit: dto.unit ? toKnown(dto.unit, UNITS) : null,
  rawUnit: dto.unit ?? "",
  notes: dto.notes ?? "",
  terms: termsFromDto(dto, scope),
  unitPrice: dto.unit_price,
  quantity: dto.quantity,
  // Recomputed from the single pure function; a total sent by the server is never trusted over it.
  total: saleQuoteTotal(dto.quantity, dto.unit_price),
  currency: dto.currency,
  deliveryDate: dto.delivery_date ?? null,
  validUntil: scope === "MILESTONE" ? null : (dto.valid_until ?? null),
  deliveryTerms: dto.delivery_terms ?? dto.notes ?? "",
  status: toKnown(dto.status, KNOWN_QUOTE_STATUSES),
  createdAt: dto.created_at,
});

// Our backend's deposit (deposit_status PENDING|DEPOSITED, deposited_at, ledger_entry_id) is the domain's payment authorization;
// the mock still answers authorization_*. Either one fills the same state.
const DEPOSIT_TO_AUTHORIZATION: Readonly<Record<string, string>> = { PENDING: "PENDING", DEPOSITED: "AUTHORIZED" };
const authorizationFromDto = (dto: QuoteRequestDto): QuoteRequest["authorization"] => {
  const raw = dto.authorization_status ?? (dto.deposit_status ? (DEPOSIT_TO_AUTHORIZATION[dto.deposit_status] ?? dto.deposit_status) : undefined);
  if (!raw) return null;
  return {
    status: toKnown(raw, AUTHORIZATION_STATES),
    agreedTotal: dto.agreed_total ?? 0,
    authorizedAt: dto.authorized_at ?? dto.deposited_at ?? null,
    authorizationId: dto.payment_authorization_id ?? dto.ledger_entry_id ?? null,
  };
};

const historyFromDto = (dto: HistoryEntryDto): HistoryEntry => ({
  id: dto.id,
  actor: toKnown(dto.actor, ACTORS),
  type: dto.type,
  // Our backend logs the buyer's deposit as DEPOSIT; the domain calls it AUTHORIZE_PAYMENT.
  kind: toKnown(dto.type === "DEPOSIT" ? "AUTHORIZE_PAYMENT" : dto.type, HISTORY_KINDS),
  from: dto.from,
  to: dto.to,
  at: dto.at,
  payload: dto.payload,
});

// A project negotiation without a scope (legacy payload) is a PROJECT one; open-request negotiations have none.
function scopeFromDto(dto: QuoteRequestDto, origin: string): NegotiationScope | null {
  if (dto.scope) return toKnown(dto.scope, NEGOTIATION_SCOPES);
  return origin === "OPEN_REQUEST" ? null : "PROJECT";
}

const requestFromDto = (dto: QuoteRequestDto): QuoteRequest => {
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
  authorization: authorizationFromDto(dto),
  ...(dto.deposit_redirect_url ? { depositRedirectUrl: dto.deposit_redirect_url } : {}),
  };
};

const catalogFromDto = (dto: z.infer<typeof catalogProjectDtoSchema>): CatalogProject => ({
  project: toProject(dto),
  producerId: dto.producer_id ?? null,
  producerName: dto.producer_name ?? "",
  negotiationLocked: dto.negotiation_locked ?? false,
  agreedMilestoneIds: dto.agreed_milestone_ids ?? [],
});

export const toCatalogProject = (data: unknown): CatalogProject => catalogFromDto(parse(catalogProjectDtoSchema, data, "catalog project"));
export const toCatalogProjects = (data: unknown): CatalogProject[] =>
  parse(z.array(catalogProjectDtoSchema), data, "catalog").map(catalogFromDto);

const openRequestFromDto = (dto: OpenRequestDto): OpenRequest => ({
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

export const toQuoteRequest = (data: unknown): QuoteRequest => requestFromDto(parse(quoteRequestDtoSchema, data, "quote request"));
export const toQuoteRequests = (data: unknown): QuoteRequest[] =>
  parse(z.array(quoteRequestDtoSchema), data, "quote request list").map(requestFromDto);
export const toOpenRequest = (data: unknown): OpenRequest => openRequestFromDto(parse(openRequestDtoSchema, data, "open request"));
export const toOpenRequests = (data: unknown): OpenRequest[] =>
  parse(z.array(openRequestDtoSchema), data, "open request list").map(openRequestFromDto);

interface OfferInput {
  unitPrice: number;
  quantity: number;
  validUntil: string;
  deliveryTerms: string;
  deliveryDate?: string;
}

// Offers and counter-offers share one body; `author` is sent only when it is not the default producer.
export const toOfferRequestDto = (input: OfferInput, author: Actor = "PRODUCER"): RespondRequestDto => ({
  ...(author === "PRODUCER" ? {} : { author }),
  unit_price: input.unitPrice,
  quantity: input.quantity,
  ...(input.deliveryDate ? { delivery_date: input.deliveryDate } : {}),
  valid_until: input.validUntil,
  delivery_terms: input.deliveryTerms,
});

export const toStartNegotiationRequestDto = (buyer: PartyIdentity, target: StartTarget): StartNegotiationDto =>
  target.scope === "PROJECT"
    ? {
        scope: "PROJECT",
        buyer_id: buyer.id,
        buyer_name: buyer.name,
        quantity: target.input.quantity,
        unit: target.input.unit,
        unit_price: target.input.unitPrice,
        delivery_date: target.input.deliveryDate,
        valid_until: target.input.validUntil,
        notes: target.input.notes,
      }
    : {
        scope: "MILESTONE",
        milestone_id: target.milestoneId,
        buyer_id: buyer.id,
        buyer_name: buyer.name,
        price: target.input.price,
        delivery_date: target.input.deliveryDate,
        notes: target.input.notes,
      };

export const toProjectCounterDto = (author: Actor, input: ProjectTermsInput): RespondRequestDto => ({
  author,
  quantity: input.quantity,
  unit: input.unit,
  unit_price: input.unitPrice,
  delivery_date: input.deliveryDate,
  valid_until: input.validUntil,
  notes: input.notes,
});

export const toMilestoneCounterDto = (author: Actor, input: MilestoneTermsInput): RespondRequestDto => ({
  author,
  price: input.price,
  delivery_date: input.deliveryDate,
  notes: input.notes,
});

export const toCreateOpenRequestDto = (buyer: PartyIdentity, input: CreateOpenRequestInput): CreateOpenRequestDto => ({
  buyer_id: buyer.id,
  buyer_name: buyer.name,
  title: input.title,
  production_type: input.productionType,
  quantity: input.quantity,
  unit: input.unit,
  ...(input.targetUnitPrice !== undefined ? { target_unit_price: input.targetUnitPrice } : {}),
  delivery_date: input.deliveryDate,
  delivery_location: input.deliveryLocation,
  notes: input.notes,
});

export const toStartNegotiationDto = (producer: PartyIdentity, input: StartOpenRequestNegotiationInput): StartOpenRequestNegotiationDto => ({
  project_id: input.projectId,
  producer_id: producer.id,
  producer_name: producer.name,
  unit_price: input.unitPrice,
  quantity: input.quantity,
  ...(input.deliveryDate ? { delivery_date: input.deliveryDate } : {}),
  valid_until: input.validUntil,
  delivery_terms: input.deliveryTerms,
});
