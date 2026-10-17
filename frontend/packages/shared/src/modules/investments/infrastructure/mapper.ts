import { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import { toProject } from "../../projects/infrastructure/mapper";
import {
  ACTORS,
  HISTORY_KINDS,
  KNOWN_CONTRACT_STATUSES,
  KNOWN_PROPOSAL_STATUSES,
  KNOWN_REVISION_STATUSES,
  type Actor,
  type CatalogProject,
  type Contract,
  type HistoryEntry,
  type HistoryKind,
  type Party,
  type Proposal,
  type ProposalRevision,
} from "../domain/investment";
import type { ProposalTermsInput } from "../schemas/proposal-terms";
import {
  catalogProjectDtoSchema,
  contractDtoSchema,
  proposalDtoSchema,
  type CatalogProjectDto,
  type ContractDto,
  type HistoryDto,
  type ProposalDto,
  type RevisionDto,
} from "./dto";

function parse<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid ${what}: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

const known = <T extends string>(values: readonly T[], raw: string): T | "UNKNOWN" => (values as readonly string[]).includes(raw) ? (raw as T) : "UNKNOWN";

const toActor = (raw: string): Actor => known(ACTORS, raw);

// ---- catalog ----

function fromCatalogDto(dto: CatalogProjectDto): CatalogProject {
  return {
    project: toProject(dto),
    producerId: dto.producer_id,
    producerName: dto.producer_name,
    quotationTotal: dto.quotation_total,
    contractLocked: dto.contract_locked,
    milestones: [...dto.milestones]
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .map((m) => ({
        id: m.id,
        sequenceOrder: m.sequence_order,
        title: m.title,
        description: m.description,
        dueDate: m.estimated_completion_date ?? null,
        suppliesBudget: m.supplies_budget,
        laborBudget: m.labor_budget,
        budget: m.supplies_budget + m.labor_budget,
      })),
  };
}

export const toCatalogProject = (data: unknown): CatalogProject => fromCatalogDto(parse(catalogProjectDtoSchema, data, "catalog project"));
export const toCatalogProjects = (data: unknown): CatalogProject[] =>
  parse(z.array(catalogProjectDtoSchema), data, "catalog list").map(fromCatalogDto);

// ---- proposals ----

const fromRevisionDto = (dto: RevisionDto): ProposalRevision => ({
  proposalId: dto.proposal_id,
  revision: dto.revision,
  author: toActor(dto.author),
  amount: dto.amount,
  yieldBps: dto.yield_bps,
  validUntil: dto.valid_until,
  notes: dto.notes,
  currency: dto.currency,
  status: known(KNOWN_REVISION_STATUSES, dto.status),
  createdAt: dto.created_at,
});

const fromHistoryDto = (dto: HistoryDto): HistoryEntry => ({
  id: dto.id,
  actor: toActor(dto.actor),
  type: dto.type,
  kind: known(HISTORY_KINDS, dto.type) as HistoryKind,
  from: dto.from ?? null,
  to: dto.to ?? null,
  at: dto.at,
  ...(dto.payload ? { payload: dto.payload } : {}),
});

export function fromProposalDto(dto: ProposalDto): Proposal {
  return {
    id: dto.id,
    projectId: dto.project_id,
    projectTitle: dto.project_title,
    projectTotal: dto.project_total,
    investorId: dto.investor_id,
    investorName: dto.investor_name,
    producerId: dto.producer_id,
    producerName: dto.producer_name,
    currency: dto.currency,
    status: known(KNOWN_PROPOSAL_STATUSES, dto.status),
    rawStatus: dto.status,
    createdAt: dto.created_at,
    revisions: dto.revisions.map(fromRevisionDto).sort((a, b) => a.revision - b.revision),
    // Append-only: oldest first.
    history: dto.history.map(fromHistoryDto).sort((a, b) => a.at.localeCompare(b.at)),
    contractId: dto.contract_id ?? null,
  };
}

export const toProposal = (data: unknown): Proposal => fromProposalDto(parse(proposalDtoSchema, data, "proposal"));
export const toProposals = (data: unknown): Proposal[] => parse(z.array(proposalDtoSchema), data, "proposal list").map(fromProposalDto);

// ---- contracts ----

export function fromContractDto(dto: ContractDto): Contract {
  return {
    id: dto.id,
    proposalId: dto.proposal_id,
    projectId: dto.project_id,
    projectTitle: dto.project_title,
    projectCode: dto.project_code,
    currency: dto.currency,
    investorId: dto.investor_id,
    investorName: dto.investor_name,
    producerId: dto.producer_id,
    producerName: dto.producer_name,
    amount: dto.amount,
    yieldBps: dto.yield_bps,
    platformFeePct: dto.platform_fee_pct,
    projectTotal: dto.project_total,
    startDate: dto.start_date,
    estimatedEndDate: dto.estimated_end_date,
    milestones: [...dto.milestones]
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .map((m) => ({ id: m.id, sequenceOrder: m.sequence_order, title: m.title, cap: m.cap, dueDate: m.due_date ?? null })),
    documentHash: dto.document_hash,
    status: known(KNOWN_CONTRACT_STATUSES, dto.status),
    rawStatus: dto.status,
    createdAt: dto.created_at,
    investorSignature: dto.investor_signature ? { signedAt: dto.investor_signature.signed_at, signerName: dto.investor_signature.signer_name } : null,
    producerSignature: dto.producer_signature ? { signedAt: dto.producer_signature.signed_at, signerName: dto.producer_signature.signer_name } : null,
    signedAt: dto.signed_at ?? null,
  };
}

export const toContract = (data: unknown): Contract => fromContractDto(parse(contractDtoSchema, data, "contract"));

// ---- request bodies ----

export const toTermsBody = (input: ProposalTermsInput) => ({
  amount: input.amount,
  yield_bps: input.yieldBps,
  valid_until: input.validUntil,
  notes: input.notes,
});

export const toCreateProposalBody = (projectId: string, investor: { id: string; name: string }, input: ProposalTermsInput) => ({
  project_id: projectId,
  investor_id: investor.id,
  investor_name: investor.name,
  ...toTermsBody(input),
});

export const toCounterBody = (author: Party, input: ProposalTermsInput) => ({ author, ...toTermsBody(input) });
