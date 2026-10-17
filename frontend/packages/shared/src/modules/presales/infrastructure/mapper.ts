import { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import {
  ACTORS,
  HISTORY_KINDS,
  KNOWN_LISTING_STATUSES,
  KNOWN_OPEN_REQUEST_STATUSES,
  KNOWN_QUOTE_STATUSES,
  KNOWN_REQUEST_STATUSES,
  ORIGINS,
  UNITS,
  type Actor,
  type HistoryEntry,
  type OpenRequest,
  type PresaleListing,
  type QuoteRequest,
  type SaleQuote,
} from "../domain/presale";
import { saleQuoteTotal } from "../domain/presale-rules";
import type { PartyIdentity } from "../application/presale-repository";
import type { CreateOpenRequestInput } from "../schemas/create-open-request";
import type { PublishListingInput } from "../schemas/publish-listing";
import type { RequestQuoteInput } from "../schemas/request-quote";
import type { StartOpenRequestNegotiationInput } from "../schemas/start-open-request-negotiation";
import {
  listingDtoSchema,
  openRequestDtoSchema,
  quoteRequestDtoSchema,
  type CreateOpenRequestDto,
  type CreateRequestDto,
  type HistoryEntryDto,
  type ListingDto,
  type OpenRequestDto,
  type PublishListingRequestDto,
  type QuoteRequestDto,
  type RespondRequestDto,
  type SaleQuoteDto,
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

const listingFromDto = (dto: ListingDto): PresaleListing => ({
  id: dto.id,
  projectId: dto.project_id,
  producerId: dto.producer_id ?? null,
  producerName: dto.producer_name ?? "",
  title: dto.title,
  summary: dto.summary,
  productionType: dto.production_type,
  expectedQuantity: dto.expected_quantity,
  unit: toKnown(dto.unit, UNITS),
  rawUnit: dto.unit,
  referenceUnitPrice: dto.reference_unit_price,
  currency: dto.currency,
  estimatedHarvestDate: dto.estimated_harvest_date,
  status: toKnown(dto.status, KNOWN_LISTING_STATUSES),
  committedQuantity: dto.committed_quantity,
  createdAt: dto.created_at,
});

const quoteFromDto = (dto: SaleQuoteDto): SaleQuote => ({
  requestId: dto.request_id,
  revision: dto.revision,
  // Offers from before authorship existed were always the producer's.
  author: toKnown(dto.author ?? "PRODUCER", ACTORS) as Actor,
  unitPrice: dto.unit_price,
  quantity: dto.quantity,
  // Recomputed from the single pure function; a total sent by the server is never trusted over it.
  total: saleQuoteTotal(dto.quantity, dto.unit_price),
  currency: dto.currency,
  deliveryDate: dto.delivery_date ?? null,
  validUntil: dto.valid_until,
  deliveryTerms: dto.delivery_terms,
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

const requestFromDto = (dto: QuoteRequestDto): QuoteRequest => ({
  id: dto.id,
  origin: toKnown(dto.origin ?? "PROJECT_INTEREST", ORIGINS),
  openRequestId: dto.open_request_id ?? null,
  listingId: dto.listing_id,
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
  quotes: dto.quotes.map(quoteFromDto),
  history: [...dto.history].map(historyFromDto).sort((a, b) => a.at.localeCompare(b.at)),
});

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

export const toListing = (data: unknown): PresaleListing => listingFromDto(parse(listingDtoSchema, data, "presale"));
export const toListings = (data: unknown): PresaleListing[] =>
  parse(z.array(listingDtoSchema), data, "presale list").map(listingFromDto);
export const toQuoteRequest = (data: unknown): QuoteRequest => requestFromDto(parse(quoteRequestDtoSchema, data, "quote request"));
export const toQuoteRequests = (data: unknown): QuoteRequest[] =>
  parse(z.array(quoteRequestDtoSchema), data, "quote request list").map(requestFromDto);
export const toOpenRequest = (data: unknown): OpenRequest => openRequestFromDto(parse(openRequestDtoSchema, data, "open request"));
export const toOpenRequests = (data: unknown): OpenRequest[] =>
  parse(z.array(openRequestDtoSchema), data, "open request list").map(openRequestFromDto);

export const toPublishRequestDto = (input: PublishListingInput): PublishListingRequestDto => ({
  title: input.title,
  summary: input.summary,
  expected_quantity: input.expectedQuantity,
  unit: input.unit,
  reference_unit_price: input.referenceUnitPrice,
  estimated_harvest_date: input.estimatedHarvestDate,
});

export const toCreateRequestDto = (buyer: PartyIdentity, input: RequestQuoteInput): CreateRequestDto => ({
  buyer_id: buyer.id,
  buyer_name: buyer.name,
  quantity: input.quantity,
  desired_delivery_date: input.desiredDeliveryDate,
  notes: input.notes,
});

interface OfferTerms {
  unitPrice: number;
  quantity: number;
  validUntil: string;
  deliveryTerms: string;
  deliveryDate?: string;
}

// Offers and counter-offers share one body; `author` is sent only when it is not the default producer.
export const toOfferRequestDto = (input: OfferTerms, author: Actor = "PRODUCER"): RespondRequestDto => ({
  ...(author === "PRODUCER" ? {} : { author }),
  unit_price: input.unitPrice,
  quantity: input.quantity,
  ...(input.deliveryDate ? { delivery_date: input.deliveryDate } : {}),
  valid_until: input.validUntil,
  delivery_terms: input.deliveryTerms,
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
  listing_id: input.listingId,
  producer_id: producer.id,
  producer_name: producer.name,
  unit_price: input.unitPrice,
  quantity: input.quantity,
  ...(input.deliveryDate ? { delivery_date: input.deliveryDate } : {}),
  valid_until: input.validUntil,
  delivery_terms: input.deliveryTerms,
});
