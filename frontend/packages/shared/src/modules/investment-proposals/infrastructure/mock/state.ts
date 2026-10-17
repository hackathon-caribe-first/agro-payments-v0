import { INVESTOR_IDENTITY } from "../../../presales/infrastructure/mock/identities";
import type { MilestoneDetailDto } from "../../../milestones/infrastructure/dto";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import { contractDocument, type ContractTerms } from "../../domain/contract-rules";
import { sha256HexSync } from "../../domain/hash";
import { isoToday } from "../../domain/proposal-rules";
import type { ContractDto, ProposalDto } from "../dto";

// ---- who owns what ----

// The producer the web app acts as. Mirrors LOCAL_PRODUCER in the presales mock fixtures (keep both in sync).
export const LOCAL_PRODUCER = { id: "producer-main", name: "Agrícola La Esperanza S.A.S." } as const;
// The investor the web app acts as. Mirrors INVESTOR_PROFILE in apps/web/src/investment-proposals/module.ts (keep both in sync).
export const SEED_INVESTOR = { id: INVESTOR_IDENTITY.id, name: INVESTOR_IDENTITY.name } as const;

const SIERRA = { id: "producer-sierra", name: "Cooperativa Café de la Sierra" } as const;
const TOLIMA = { id: "producer-tolima", name: "Cacaoteros del Tolima" } as const;

// Projects not listed here belong to the local producer (like the presales mock does).
const PROJECT_PRODUCERS: Readonly<Record<string, { id: string; name: string }>> = {
  "ext-sierra-cafe": SIERRA,
  "ext-tolima-cacao": TOLIMA,
};
export const projectProducer = (projectId: string): { id: string; name: string } => PROJECT_PRODUCERS[projectId] ?? LOCAL_PRODUCER;

// ---- contract template instance ----

export function contractTermsFor(
  id: string,
  project: ProjectDto,
  milestones: readonly MilestoneDetailDto[],
  parties: { investorName: string; producerName: string },
  agreed: { amount: number; yieldBps: number },
): ContractTerms {
  const ordered = [...milestones].sort((a, b) => a.sequence_order - b.sequence_order);
  return {
    id,
    projectId: project.id,
    projectTitle: project.title,
    projectCode: project.project_code,
    currency: project.currency,
    investorName: parties.investorName,
    producerName: parties.producerName,
    amount: agreed.amount,
    yieldBps: agreed.yieldBps,
    platformFeePct: project.platform_fee_pct,
    projectTotal: ordered.reduce((sum, m) => sum + m.supplies_budget + m.labor_budget, 0),
    startDate: project.start_date,
    estimatedEndDate: project.estimated_end_date,
    milestones: ordered.map((m) => ({
      id: m.id,
      sequenceOrder: m.sequence_order,
      title: m.title,
      cap: m.supplies_budget + m.labor_budget,
      dueDate: m.estimated_completion_date ?? null,
    })),
  };
}

export function contractDtoFrom(terms: ContractTerms, proposal: ProposalDto, documentHash: string, createdAt: string): ContractDto {
  return {
    id: terms.id,
    proposal_id: proposal.id,
    project_id: terms.projectId,
    project_title: terms.projectTitle,
    project_code: terms.projectCode,
    currency: terms.currency,
    investor_id: proposal.investor_id,
    investor_name: terms.investorName,
    producer_id: proposal.producer_id,
    producer_name: terms.producerName,
    amount: terms.amount,
    yield_bps: terms.yieldBps,
    platform_fee_pct: terms.platformFeePct,
    project_total: terms.projectTotal,
    start_date: terms.startDate,
    estimated_end_date: terms.estimatedEndDate,
    milestones: terms.milestones.map((m) => ({ id: m.id, sequence_order: m.sequenceOrder, title: m.title, cap: m.cap, due_date: m.dueDate })),
    document_hash: documentHash,
    status: "PENDING_SIGNATURES",
    created_at: createdAt,
    investor_signature: null,
    producer_signature: null,
    signed_at: null,
  };
}

// ---- state ----

export interface InvestmentsState {
  proposals: ProposalDto[];
  contracts: ContractDto[];
}

const addDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoToday(date);
};
const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

interface BaseStore {
  projects: ProjectDto[];
  externalProjects: ProjectDto[];
  milestones: MilestoneDetailDto[];
}

// Module-local state (never added to the shared store types). Seeds reference existing project ids:
//  - ip-seed-1  open proposal on a contract-less project (proj-cacao-arauca), waiting for the local producer.
//  - ip-seed-2  counter-offer from the producer on ext-sierra-cafe, waiting for the investor.
//  - ip-seed-3  accepted proposal on proj-limon-valle (local producer) with a contract signed by the producer only.
// A seed whose project is missing from the base store is skipped.
export function createInvestmentsState(base: BaseStore): InvestmentsState {
  const state: InvestmentsState = { proposals: [], contracts: [] };
  const findProject = (id: string) => [...base.projects, ...base.externalProjects].find((p) => p.id === id);
  const milestonesOf = (id: string) => base.milestones.filter((m) => m.project_id === id);
  const total = (id: string) => milestonesOf(id).reduce((sum, m) => sum + m.supplies_budget + m.labor_budget, 0);

  const seedProposal = (
    id: string,
    projectId: string,
    status: string,
    revisions: { author: "INVESTOR" | "PRODUCER"; amount: number; yieldBps: number; validDays: number; notes: string; status: string; ago: number }[],
    history: { actor: string; type: string; from: string | null; to: string | null; ago: number; payload?: Record<string, unknown> }[],
  ): ProposalDto | null => {
    const project = findProject(projectId);
    if (!project) return null;
    const producer = projectProducer(projectId);
    const proposal: ProposalDto = {
      id,
      project_id: project.id,
      project_title: project.title,
      project_total: total(project.id),
      investor_id: SEED_INVESTOR.id,
      investor_name: SEED_INVESTOR.name,
      producer_id: producer.id,
      producer_name: producer.name,
      currency: project.currency,
      status,
      created_at: minutesAgo(revisions[0].ago),
      revisions: revisions.map((r, i) => ({
        proposal_id: id,
        revision: i + 1,
        author: r.author,
        amount: r.amount,
        yield_bps: r.yieldBps,
        valid_until: addDays(r.validDays),
        notes: r.notes,
        currency: project.currency,
        status: r.status,
        created_at: minutesAgo(r.ago),
      })),
      history: history.map((h, i) => ({
        id: `${id}-h${i + 1}`,
        actor: h.actor,
        type: h.type,
        from: h.from,
        to: h.to,
        at: minutesAgo(h.ago),
        ...(h.payload ? { payload: h.payload } : {}),
      })),
      contract_id: null,
    };
    state.proposals.push(proposal);
    return proposal;
  };

  seedProposal(
    "ip-seed-1",
    "proj-cacao-arauca",
    "PROPOSED",
    [{ author: "INVESTOR", amount: 20000000, yieldBps: 1400, validDays: 14, notes: "Interesados en fondear la siembra por hitos.", status: "SENT", ago: 180 }],
    [{ actor: "INVESTOR", type: "PROPOSED", from: null, to: "PROPOSED", ago: 180, payload: { revision: 1, amount: 20000000, yield_bps: 1400 } }],
  );

  seedProposal(
    "ip-seed-2",
    "ext-sierra-cafe",
    "NEGOTIATING",
    [
      { author: "INVESTOR", amount: 18000000, yieldBps: 1200, validDays: 12, notes: "", status: "SUPERSEDED", ago: 2000 },
      { author: "PRODUCER", amount: 18000000, yieldBps: 1350, validDays: 10, notes: "Con el beneficio, el rendimiento justo es 13,5 %.", status: "SENT", ago: 600 },
    ],
    [
      { actor: "INVESTOR", type: "PROPOSED", from: null, to: "PROPOSED", ago: 2000, payload: { revision: 1, amount: 18000000, yield_bps: 1200 } },
      { actor: "PRODUCER", type: "COUNTER_OFFER", from: "PROPOSED", to: "NEGOTIATING", ago: 600, payload: { revision: 2, amount: 18000000, yield_bps: 1350 } },
    ],
  );

  const accepted = seedProposal(
    "ip-seed-3",
    "proj-limon-valle",
    "ACCEPTED",
    [
      { author: "INVESTOR", amount: 12000000, yieldBps: 1400, validDays: 20, notes: "", status: "SUPERSEDED", ago: 4000 },
      { author: "PRODUCER", amount: 12000000, yieldBps: 1500, validDays: 18, notes: "Aceptamos si el rendimiento sube a 15 %.", status: "ACCEPTED", ago: 3000 },
    ],
    [
      { actor: "INVESTOR", type: "PROPOSED", from: null, to: "PROPOSED", ago: 4000, payload: { revision: 1, amount: 12000000, yield_bps: 1400 } },
      { actor: "PRODUCER", type: "COUNTER_OFFER", from: "PROPOSED", to: "NEGOTIATING", ago: 3500, payload: { revision: 2, amount: 12000000, yield_bps: 1500 } },
      { actor: "INVESTOR", type: "ACCEPT", from: "NEGOTIATING", to: "ACCEPTED", ago: 3000, payload: { revision: 2, amount: 12000000, yield_bps: 1500 } },
      { actor: "SYSTEM", type: "CONTRACT_GENERATED", from: null, to: null, ago: 3000, payload: { contract_id: "ic-seed-1" } },
      { actor: "PRODUCER", type: "CONTRACT_SIGNED", from: null, to: null, ago: 2500, payload: { contract_id: "ic-seed-1", party: "PRODUCER" } },
    ],
  );
  const project = accepted && findProject(accepted.project_id);
  if (accepted && project) {
    const terms = contractTermsFor(
      "ic-seed-1",
      project,
      milestonesOf(project.id),
      { investorName: accepted.investor_name, producerName: accepted.producer_name },
      { amount: 12000000, yieldBps: 1500 },
    );
    const contract = contractDtoFrom(terms, accepted, sha256HexSync(contractDocument(terms)), minutesAgo(3000));
    contract.producer_signature = { signed_at: minutesAgo(2500), signer_name: accepted.producer_name };
    state.contracts.push(contract);
    accepted.contract_id = contract.id;
  }

  return state;
}
