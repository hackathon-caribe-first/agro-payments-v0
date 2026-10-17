import { z } from "zod";
import { projectDtoSchema } from "../../projects/infrastructure/dto";

// Transport shapes (snake_case). Validated at the boundary, then mapped to domain types.
// Statuses, actors and event kinds are free strings: the mapper degrades unknown values to "UNKNOWN".

export const catalogMilestoneDtoSchema = z.object({
  id: z.string(),
  sequence_order: z.number().int(),
  title: z.string(),
  description: z.string().default(""),
  estimated_completion_date: z.string().nullish(),
  supplies_budget: z.number(),
  labor_budget: z.number(),
});

// The project plus its producer, milestones and server-derived figures.
export const catalogProjectDtoSchema = projectDtoSchema.extend({
  producer_id: z.string(),
  producer_name: z.string(),
  quotation_total: z.number(),
  contract_locked: z.boolean().default(false),
  milestones: z.array(catalogMilestoneDtoSchema),
});

export const revisionDtoSchema = z.object({
  proposal_id: z.string(),
  revision: z.number().int(),
  author: z.string(),
  amount: z.number(),
  yield_bps: z.number(),
  valid_until: z.string(),
  notes: z.string().default(""),
  currency: z.string().default("COP"),
  status: z.string(),
  created_at: z.string(),
});

export const historyDtoSchema = z.object({
  id: z.string(),
  actor: z.string(),
  type: z.string(),
  from: z.string().nullish(),
  to: z.string().nullish(),
  at: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const proposalDtoSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  project_title: z.string(),
  project_total: z.number(),
  investor_id: z.string(),
  investor_name: z.string(),
  producer_id: z.string(),
  producer_name: z.string(),
  currency: z.string().default("COP"),
  status: z.string(),
  created_at: z.string(),
  revisions: z.array(revisionDtoSchema),
  history: z.array(historyDtoSchema),
  contract_id: z.string().nullish(),
});

export const signatureDtoSchema = z.object({ signed_at: z.string(), signer_name: z.string() });

export const contractMilestoneDtoSchema = z.object({
  id: z.string(),
  sequence_order: z.number().int(),
  title: z.string(),
  cap: z.number(),
  due_date: z.string().nullish(),
});

export const contractDtoSchema = z.object({
  id: z.string(),
  proposal_id: z.string(),
  project_id: z.string(),
  project_title: z.string(),
  project_code: z.string(),
  currency: z.string().default("COP"),
  investor_id: z.string(),
  investor_name: z.string(),
  producer_id: z.string(),
  producer_name: z.string(),
  amount: z.number(),
  yield_bps: z.number(),
  platform_fee_pct: z.number(),
  project_total: z.number(),
  start_date: z.string(),
  estimated_end_date: z.string(),
  milestones: z.array(contractMilestoneDtoSchema),
  document_hash: z.string(),
  status: z.string(),
  created_at: z.string(),
  investor_signature: signatureDtoSchema.nullish(),
  producer_signature: signatureDtoSchema.nullish(),
  signed_at: z.string().nullish(),
});

export type CatalogProjectDto = z.infer<typeof catalogProjectDtoSchema>;
export type ProposalDto = z.infer<typeof proposalDtoSchema>;
export type RevisionDto = z.infer<typeof revisionDtoSchema>;
export type HistoryDto = z.infer<typeof historyDtoSchema>;
export type ContractDto = z.infer<typeof contractDtoSchema>;

// ---- request bodies (validated by the mock like a backend would) ----

const termsBody = {
  amount: z.unknown(),
  yield_bps: z.unknown(),
  valid_until: z.unknown(),
  notes: z.unknown().optional(),
};

export const createProposalBodySchema = z.object({
  project_id: z.string(),
  investor_id: z.string(),
  investor_name: z.string(),
  ...termsBody,
});

export const counterBodySchema = z.object({ author: z.string().optional(), ...termsBody });

export const actorBodySchema = z.object({ actor: z.string().optional() });

export const signBodySchema = z.object({ party: z.string(), party_id: z.string() });
