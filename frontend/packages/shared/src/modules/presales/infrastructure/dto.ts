import { z } from "zod";

// Transport shapes (snake_case). Status, unit, actor, origin and type fields stay free strings here so values added by a
// newer server still pass the boundary; the mapper converts them to domain unions with an UNKNOWN fallback.
// Fields added after the first release are optional with mapper defaults, so older payloads keep parsing.

export const listingDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  producer_id: z.string().nullable().optional(),
  producer_name: z.string().optional(),
  title: z.string(),
  summary: z.string(),
  production_type: z.string(),
  expected_quantity: z.number(),
  unit: z.string(),
  reference_unit_price: z.number(),
  currency: z.string(),
  estimated_harvest_date: z.string(),
  status: z.string(),
  committed_quantity: z.number(),
  created_at: z.string(),
});

export const saleQuoteDtoSchema = z.object({
  request_id: z.string(),
  revision: z.number().int().positive(),
  author: z.string().optional(),
  unit_price: z.number(),
  quantity: z.number(),
  total: z.number().optional(),
  currency: z.string(),
  delivery_date: z.string().nullable().optional(),
  valid_until: z.string(),
  delivery_terms: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export const historyEntryDtoSchema = z.object({
  id: z.string(),
  actor: z.string(),
  type: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  at: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const quoteRequestDtoSchema = z.object({
  id: z.string(),
  origin: z.string().optional(),
  open_request_id: z.string().nullable().optional(),
  listing_id: z.string(),
  project_id: z.string(),
  producer_id: z.string().nullable().optional(),
  producer_name: z.string().optional(),
  buyer_id: z.string(),
  buyer_name: z.string(),
  quantity: z.number(),
  desired_delivery_date: z.string(),
  notes: z.string(),
  status: z.string(),
  created_at: z.string(),
  quotes: z.array(saleQuoteDtoSchema),
  history: z.array(historyEntryDtoSchema),
});

export const openRequestDtoSchema = z.object({
  id: z.string(),
  buyer_id: z.string(),
  buyer_name: z.string(),
  title: z.string(),
  production_type: z.string(),
  quantity: z.number(),
  unit: z.string(),
  target_unit_price: z.number().nullable().optional(),
  currency: z.string(),
  delivery_date: z.string(),
  delivery_location: z.string(),
  notes: z.string(),
  status: z.string(),
  // Server-derived, like a listing's committed quantity.
  awarded_quantity: z.number().optional(),
  created_at: z.string(),
});

export const publishListingRequestDtoSchema = z.object({
  title: z.string(),
  summary: z.string(),
  expected_quantity: z.number(),
  unit: z.string(),
  reference_unit_price: z.number(),
  estimated_harvest_date: z.string(),
});

export const createRequestDtoSchema = z.object({
  buyer_id: z.string(),
  buyer_name: z.string(),
  quantity: z.number(),
  desired_delivery_date: z.string(),
  notes: z.string(),
});

// An offer or counter-offer. `author` defaults to PRODUCER, which keeps the original one-shot response call valid.
export const respondRequestDtoSchema = z.object({
  author: z.string().optional(),
  unit_price: z.number(),
  quantity: z.number(),
  delivery_date: z.string().optional(),
  valid_until: z.string(),
  delivery_terms: z.string(),
});

// Optional body of accept / reject / withdraw: who is acting (default BUYER, as before).
export const actorBodyDtoSchema = z.object({ actor: z.string().optional() });

export const createOpenRequestDtoSchema = z.object({
  buyer_id: z.string(),
  buyer_name: z.string(),
  title: z.string(),
  production_type: z.string(),
  quantity: z.number(),
  unit: z.string(),
  target_unit_price: z.number().optional(),
  delivery_date: z.string(),
  delivery_location: z.string(),
  notes: z.string(),
});

export const startOpenRequestNegotiationDtoSchema = z.object({
  listing_id: z.string(),
  producer_id: z.string(),
  producer_name: z.string(),
  unit_price: z.number(),
  quantity: z.number(),
  delivery_date: z.string().optional(),
  valid_until: z.string(),
  delivery_terms: z.string(),
});

export type ListingDto = z.infer<typeof listingDtoSchema>;
export type SaleQuoteDto = z.infer<typeof saleQuoteDtoSchema>;
export type HistoryEntryDto = z.infer<typeof historyEntryDtoSchema>;
export type QuoteRequestDto = z.infer<typeof quoteRequestDtoSchema>;
export type OpenRequestDto = z.infer<typeof openRequestDtoSchema>;
export type PublishListingRequestDto = z.infer<typeof publishListingRequestDtoSchema>;
export type CreateRequestDto = z.infer<typeof createRequestDtoSchema>;
export type RespondRequestDto = z.infer<typeof respondRequestDtoSchema>;
export type CreateOpenRequestDto = z.infer<typeof createOpenRequestDtoSchema>;
export type StartOpenRequestNegotiationDto = z.infer<typeof startOpenRequestNegotiationDtoSchema>;
