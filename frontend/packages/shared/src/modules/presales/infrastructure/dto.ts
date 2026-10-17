import { z } from "zod";
import { projectDtoSchema } from "../../projects/infrastructure/dto";

// Transport shapes (snake_case). Status, unit, actor, origin and type fields stay free strings here so values added by a
// newer server still pass the boundary; the mapper converts them to domain unions with an UNKNOWN fallback.
// Fields added after the first release are optional with mapper defaults, so older payloads keep parsing.

export const saleQuoteDtoSchema = z.object({
  request_id: z.string(),
  revision: z.number().int().positive(),
  author: z.string().optional(),
  unit_price: z.number(),
  quantity: z.number(),
  total: z.number().optional(),
  currency: z.string(),
  // PROJECT offers carry the buyer-chosen unit; milestone offers travel as unit_price = price, quantity = 1.
  unit: z.string().optional(),
  notes: z.string().optional(),
  delivery_date: z.string().nullable().optional(),
  // Milestone offers have no validity: they never expire.
  valid_until: z.string().nullable().optional(),
  delivery_terms: z.string().optional(),
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
  scope: z.string().nullable().optional(),
  milestone_id: z.string().nullable().optional(),
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
  // Present once a PROJECT offer is accepted: the frozen total and the deposit state.
  agreed_total: z.number().optional(),
  deposit_status: z.string().optional(),
  deposited_at: z.string().nullable().optional(),
  ledger_entry_id: z.string().nullable().optional(),
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

// An offer or counter-offer. `author` defaults to PRODUCER, which keeps the original one-shot response call valid.
// Every term is optional here on purpose: the scope-aware domain schema reports the missing ones as field errors.
export const respondRequestDtoSchema = z.object({
  author: z.string().optional(),
  unit_price: z.number().optional(),
  // A MILESTONE counter carries its lump-sum price here.
  price: z.number().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  delivery_date: z.string().optional(),
  valid_until: z.string().optional(),
  delivery_terms: z.string().optional(),
  notes: z.string().optional(),
});

// Optional body of accept / reject / withdraw: who is acting (default BUYER, as before).
// expected_total is the total the client showed the user: a mismatch means it is stale (accepting a PROJECT offer).
export const actorBodyDtoSchema = z.object({ actor: z.string().optional(), expected_total: z.number().optional() });

// A project, as the buyer sees it in the catalog.
export const catalogProjectDtoSchema = projectDtoSchema.extend({
  producer_id: z.string().nullable().optional(),
  producer_name: z.string().optional(),
  negotiation_locked: z.boolean().optional(),
  agreed_milestone_ids: z.array(z.string()).optional(),
});

// POST /projects/:id/negotiations: the buyer opens a negotiation on the project or on one milestone.
export const startNegotiationDtoSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("PROJECT"),
    buyer_id: z.string(),
    buyer_name: z.string(),
    quantity: z.number(),
    unit: z.string(),
    unit_price: z.number(),
    delivery_date: z.string(),
    valid_until: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    scope: z.literal("MILESTONE"),
    milestone_id: z.string(),
    buyer_id: z.string(),
    buyer_name: z.string(),
    price: z.number(),
    delivery_date: z.string(),
    notes: z.string().optional(),
  }),
]);

// POST /negotiations/:id/deposit
export const depositBodyDtoSchema = z.object({ buyer_id: z.string(), expected_total: z.number().optional() });

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
  project_id: z.string(),
  producer_id: z.string(),
  producer_name: z.string(),
  unit_price: z.number(),
  quantity: z.number(),
  delivery_date: z.string().optional(),
  valid_until: z.string(),
  delivery_terms: z.string(),
});

export type SaleQuoteDto = z.infer<typeof saleQuoteDtoSchema>;
export type HistoryEntryDto = z.infer<typeof historyEntryDtoSchema>;
export type QuoteRequestDto = z.infer<typeof quoteRequestDtoSchema>;
export type OpenRequestDto = z.infer<typeof openRequestDtoSchema>;
export type CatalogProjectDto = z.infer<typeof catalogProjectDtoSchema>;
export type StartNegotiationDto = z.infer<typeof startNegotiationDtoSchema>;
export type DepositBodyDto = z.infer<typeof depositBodyDtoSchema>;
export type RespondRequestDto = z.infer<typeof respondRequestDtoSchema>;
export type CreateOpenRequestDto = z.infer<typeof createOpenRequestDtoSchema>;
export type StartOpenRequestNegotiationDto = z.infer<typeof startOpenRequestNegotiationDtoSchema>;
