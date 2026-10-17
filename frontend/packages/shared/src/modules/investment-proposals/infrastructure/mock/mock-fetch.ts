import { FORM_LEVEL_KEY, type FieldErrors } from "../../../milestones/domain/errors";
import { toFieldErrors } from "../../../milestones/schemas/evidence-log";
import type { MilestoneDetailDto } from "../../../milestones/infrastructure/dto";
import { projectQuotationTotal } from "../../../projects/domain/project-rules";
import type { ProjectDto, RejectionBody } from "../../../projects/infrastructure/dto";
import type { PresalesMockStore } from "../../../presales/infrastructure/mock/store";
import { contractDocument, isContractParty, isFullySigned, signBlock } from "../../domain/contract-rules";
import { sha256Hex } from "../../domain/hash";
import type { Party } from "../../domain/investment";
import {
  canAct,
  effectiveProposalStatus,
  effectiveRevisionStatus,
  isoToday,
  isProposalLive,
  isVisibleToInvestors,
  latestRevision,
  proposeBlock,
} from "../../domain/proposal-rules";
import { PROPOSAL_TRANSITIONS, REVISION_TRANSITIONS, nextStatus } from "../../domain/transitions";
import { buildCounterSchema, buildProposalTermsSchema } from "../../schemas/proposal-terms";
import {
  actorBodySchema,
  counterBodySchema,
  createProposalBodySchema,
  signBodySchema,
  type CatalogProjectDto,
  type ProposalDto,
} from "../dto";
import { fromContractDto, fromProposalDto } from "../mapper";
import { contractDtoFrom, contractTermsFor, createInvestmentsState, projectProducer, type InvestmentsState } from "./state";

type RejectionErrors = RejectionBody["errors"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Both failure kinds use the same body shape: { error, errors: { path: [messages] } }.
const reject = (status: 400 | 409, errors: RejectionErrors) => json({ error: "Request rejected", errors }, status);
const invalid = (errors: FieldErrors) => reject(400, errors);
const conflict = (message: string) => reject(409, { [FORM_LEVEL_KEY]: [message] });
const malformed = () => invalid({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] });

const TURN_MESSAGE = "Es el turno de la otra parte.";
const EXPIRED_MESSAGE = "La propuesta venció.";
const UNAVAILABLE_MESSAGE = "Esta acción ya no está disponible para la propuesta.";
const SUPERSEDED_MESSAGE = "Esta oferta ya fue superada por una contraoferta.";

const PROPOSE_MESSAGES = {
  project_status: "Este proyecto ya no admite propuestas de inversión.",
  contract_exists: "Este proyecto ya tiene un contrato: no admite nuevas propuestas.",
  duplicate: "Ya tienes una propuesta activa para este proyecto.",
} as const;

const SIGN_MESSAGES = {
  not_pending: "Este contrato ya no está pendiente de firmas.",
  already_signed: "Ya firmaste este contrato.",
  not_party: "Solo las partes del contrato pueden firmarlo.",
} as const;

const isParty = (value: string): value is Party => value === "INVESTOR" || value === "PRODUCER";

interface Options {
  today?: () => string;
  state?: InvestmentsState;
}

// Investor catalog, investment proposals and contracts. Every path is anchored and lives under its own prefix
// (/investor/catalog, /investments/**, /contracts/**), so this handler never shadows an existing endpoint.
//
// State: proposals and contracts live in module-local arrays. The only thing written to the shared store is the
// documented status transition: when BOTH parties have signed, the project's `current_status` is set to
// CONTRACT_SIGNED IN PLACE (only from DRAFT; a project already past that stays where it is).
export function createInvestmentsMockFetch(base: PresalesMockStore, delegate: typeof fetch, { today = isoToday, state }: Options = {}): typeof fetch {
  const data = state ?? createInvestmentsState(base);
  let nextProposal = data.proposals.length + 1;
  let nextContract = data.contracts.length + 1;
  let nextHistory = data.proposals.reduce((n, p) => n + p.history.length, 0) + 1;

  const allProjects = (): ProjectDto[] => [...base.projects, ...base.externalProjects];
  const findProject = (id: string) => allProjects().find((p) => p.id === id);
  const milestonesOf = (projectId: string): MilestoneDetailDto[] =>
    base.milestones.filter((m) => m.project_id === projectId).sort((a, b) => a.sequence_order - b.sequence_order);
  const quotationTotal = (projectId: string) =>
    projectQuotationTotal(
      milestonesOf(projectId).map((m) => ({ id: m.id, suppliesBudget: m.supplies_budget, laborBudget: m.labor_budget })),
      new Map(),
    );
  const findProposal = (id: string) => data.proposals.find((p) => p.id === id);
  const findContract = (id: string) => data.contracts.find((c) => c.id === id);
  // A project is locked once one of its proposals was accepted.
  const contractLocked = (projectId: string) => data.proposals.some((p) => p.project_id === projectId && p.status === "ACCEPTED");

  function serializeCatalog(project: ProjectDto): CatalogProjectDto {
    const producer = projectProducer(project.id);
    return {
      ...project,
      producer_id: producer.id,
      producer_name: producer.name,
      quotation_total: quotationTotal(project.id),
      contract_locked: contractLocked(project.id),
      milestones: milestonesOf(project.id).map((m) => ({
        id: m.id,
        sequence_order: m.sequence_order,
        title: m.title,
        description: m.description,
        estimated_completion_date: m.estimated_completion_date ?? null,
        supplies_budget: m.supplies_budget,
        labor_budget: m.labor_budget,
      })),
    };
  }

  const visibleProjects = () => allProjects().filter((p) => isVisibleToInvestors(p.current_status));

  function appendHistory(proposal: ProposalDto, actor: string, type: string, from: string | null, to: string | null, payload?: Record<string, unknown>) {
    proposal.history.push({
      id: `ih-${nextHistory++}`,
      actor,
      type,
      from,
      to,
      at: new Date().toISOString(),
      ...(payload ? { payload } : {}),
    });
  }

  // Moves the proposal along its transition table and records the event.
  function move(proposal: ProposalDto, action: string, actor: string, type: string, payload?: Record<string, unknown>) {
    const from = proposal.status;
    proposal.status = nextStatus(PROPOSAL_TRANSITIONS, from, action) ?? from;
    appendHistory(proposal, actor, type, from, proposal.status, payload);
  }

  const revisionPayload = (r: { revision: number; amount: number; yield_bps: number }) => ({
    revision: r.revision,
    amount: r.amount,
    yield_bps: r.yield_bps,
  });

  const readBody = (init?: RequestInit): unknown => {
    try {
      return JSON.parse(String(init?.body ?? "null"));
    } catch {
      return undefined;
    }
  };

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");
    const now = today();

    // --- investor catalog: auto-filled from every project open to investment ---
    if (method === "GET" && path === "/investor/catalog") {
      return json(visibleProjects().map(serializeCatalog));
    }
    const catalogMatch = path.match(/^\/investor\/catalog\/([^/]+)$/);
    if (method === "GET" && catalogMatch) {
      const project = visibleProjects().find((p) => p.id === catalogMatch[1]);
      return project ? json(serializeCatalog(project)) : json({ error: "Project not found" }, 404);
    }

    // --- proposals ---
    if (method === "POST" && path === "/investments/proposals") {
      const dto = createProposalBodySchema.safeParse(readBody(init));
      if (!dto.success) return malformed();
      const project = findProject(dto.data.project_id);
      if (!project) return json({ error: "Project not found" }, 404);

      const block = proposeBlock({
        projectStatus: project.current_status,
        contractLocked: contractLocked(project.id),
        hasLive: data.proposals.some(
          (p) => p.project_id === project.id && p.investor_id === dto.data.investor_id && isProposalLive(fromProposalDto(p), now),
        ),
      });
      if (block) return conflict(PROPOSE_MESSAGES[block]);

      const total = quotationTotal(project.id);
      const parsed = buildProposalTermsSchema({ today: now, maxAmount: total, currency: project.currency }).safeParse({
        amount: dto.data.amount,
        yieldPercent: dto.data.yield_bps,
        validUntil: dto.data.valid_until,
        notes: dto.data.notes,
      });
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));

      const producer = projectProducer(project.id);
      const created = new Date().toISOString();
      const proposal: ProposalDto = {
        id: `ip-${nextProposal++}`,
        project_id: project.id,
        project_title: project.title,
        project_total: total,
        investor_id: dto.data.investor_id,
        investor_name: dto.data.investor_name,
        producer_id: producer.id,
        producer_name: producer.name,
        currency: project.currency,
        status: "PROPOSED",
        created_at: created,
        revisions: [
          {
            proposal_id: "",
            revision: 1,
            author: "INVESTOR",
            amount: parsed.data.amount,
            yield_bps: parsed.data.yieldBps,
            valid_until: parsed.data.validUntil,
            notes: parsed.data.notes,
            currency: project.currency,
            status: "SENT",
            created_at: created,
          },
        ],
        history: [],
        contract_id: null,
      };
      proposal.revisions[0].proposal_id = proposal.id;
      appendHistory(proposal, "INVESTOR", "PROPOSED", null, "PROPOSED", revisionPayload({ revision: 1, amount: parsed.data.amount, yield_bps: parsed.data.yieldBps }));
      data.proposals.push(proposal);
      return json(proposal, 201);
    }

    if (method === "GET" && path === "/investments/proposals") {
      const investorId = url.searchParams.get("investor_id");
      const producerId = url.searchParams.get("producer_id");
      const projectId = url.searchParams.get("project_id");
      return json(
        data.proposals.filter(
          (p) => (!investorId || p.investor_id === investorId) && (!producerId || p.producer_id === producerId) && (!projectId || p.project_id === projectId),
        ),
      );
    }

    const proposalMatch = path.match(/^\/investments\/proposals\/([^/]+)$/);
    if (method === "GET" && proposalMatch) {
      const proposal = findProposal(proposalMatch[1]);
      return proposal ? json(proposal) : json({ error: "Proposal not found" }, 404);
    }

    // --- counter-offer ---
    const counterMatch = path.match(/^\/investments\/proposals\/([^/]+)\/counter$/);
    if (method === "POST" && counterMatch) {
      const proposal = findProposal(counterMatch[1]);
      if (!proposal) return json({ error: "Proposal not found" }, 404);
      const dto = counterBodySchema.safeParse(readBody(init));
      if (!dto.success) return malformed();
      const author = dto.data.author ?? "PRODUCER";
      if (!isParty(author)) return malformed();

      const domain = fromProposalDto(proposal);
      const status = effectiveProposalStatus(domain, now);
      if (!nextStatus(PROPOSAL_TRANSITIONS, status, "counter")) return conflict(status === "EXPIRED" ? EXPIRED_MESSAGE : "Esta propuesta ya no admite ofertas.");
      if (!canAct(domain, author, "counter", now)) return conflict(TURN_MESSAGE);
      const latest = latestRevision(domain);
      if (!latest) return conflict(UNAVAILABLE_MESSAGE);

      const parsed = buildCounterSchema({ today: now, maxAmount: proposal.project_total, currency: proposal.currency, latest }).safeParse({
        amount: dto.data.amount,
        yieldPercent: dto.data.yield_bps,
        validUntil: dto.data.valid_until,
        notes: dto.data.notes,
      });
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));

      for (const r of proposal.revisions) if (r.status === "SENT") r.status = nextStatus(REVISION_TRANSITIONS, "SENT", "supersede") ?? r.status;
      const revision = {
        proposal_id: proposal.id,
        revision: proposal.revisions.length + 1,
        author,
        amount: parsed.data.amount,
        yield_bps: parsed.data.yieldBps,
        valid_until: parsed.data.validUntil,
        notes: parsed.data.notes,
        currency: proposal.currency,
        status: "SENT",
        created_at: new Date().toISOString(),
      };
      proposal.revisions.push(revision);
      move(proposal, "counter", author, "COUNTER_OFFER", revisionPayload(revision));
      return json(proposal, 201);
    }

    // --- accepting or rejecting the latest revision ---
    const decide = path.match(/^\/investments\/proposals\/([^/]+)\/revisions\/(\d+)\/(accept|reject)$/);
    if (method === "POST" && decide) {
      const proposal = findProposal(decide[1]);
      if (!proposal) return json({ error: "Proposal not found" }, 404);
      const action = decide[3] as "accept" | "reject";
      const body = actorBodySchema.safeParse(readBody(init));
      const actor = body.success ? body.data.actor : undefined;
      if (!actor || !isParty(actor)) return malformed();

      const domain = fromProposalDto(proposal);
      const latest = latestRevision(domain);
      const revision = proposal.revisions.find((r) => r.revision === Number(decide[2]));
      if (!revision || !latest) return json({ error: "Revision not found" }, 404);
      if (latest.revision !== revision.revision) return conflict(SUPERSEDED_MESSAGE);
      if (effectiveRevisionStatus(latest, now) === "EXPIRED") return conflict(EXPIRED_MESSAGE);
      const status = effectiveProposalStatus(domain, now);
      if (!nextStatus(REVISION_TRANSITIONS, revision.status, action) || !nextStatus(PROPOSAL_TRANSITIONS, status, action)) return conflict(UNAVAILABLE_MESSAGE);
      if (!canAct(domain, actor, action, now)) return conflict(TURN_MESSAGE);

      if (action === "reject") {
        revision.status = nextStatus(REVISION_TRANSITIONS, revision.status, "reject") ?? revision.status;
        move(proposal, "reject", actor, "REJECT", revisionPayload(revision));
        return json(proposal);
      }

      // Accepting: every guard runs before anything is mutated.
      const project = findProject(proposal.project_id);
      if (!project) return json({ error: "Project not found" }, 404);
      if (!isVisibleToInvestors(project.current_status)) return conflict(PROPOSE_MESSAGES.project_status);
      if (contractLocked(project.id)) return conflict(PROPOSE_MESSAGES.contract_exists);

      const contractId = `ic-${nextContract++}`;
      const terms = contractTermsFor(
        contractId,
        project,
        milestonesOf(project.id),
        { investorName: proposal.investor_name, producerName: proposal.producer_name },
        { amount: revision.amount, yieldBps: revision.yield_bps },
      );
      const hash = await sha256Hex(contractDocument(terms));

      revision.status = nextStatus(REVISION_TRANSITIONS, revision.status, "accept") ?? revision.status;
      move(proposal, "accept", actor, "ACCEPT", revisionPayload(revision));
      const contract = contractDtoFrom(terms, proposal, hash, new Date().toISOString());
      data.contracts.push(contract);
      proposal.contract_id = contract.id;
      appendHistory(proposal, "SYSTEM", "CONTRACT_GENERATED", null, null, { contract_id: contract.id, document_hash: hash });

      // The agreement closes every rival proposal on the project.
      for (const rival of data.proposals) {
        if (rival.id === proposal.id || rival.project_id !== proposal.project_id) continue;
        if (!nextStatus(PROPOSAL_TRANSITIONS, rival.status, "auto_close")) continue;
        for (const r of rival.revisions) if (r.status === "SENT") r.status = nextStatus(REVISION_TRANSITIONS, "SENT", "auto_close") ?? r.status;
        move(rival, "auto_close", "SYSTEM", "AUTO_CLOSE", { agreed_proposal_id: proposal.id });
      }
      return json(proposal);
    }

    // --- the investor pulls the proposal back ---
    const withdrawMatch = path.match(/^\/investments\/proposals\/([^/]+)\/withdraw$/);
    if (method === "POST" && withdrawMatch) {
      const proposal = findProposal(withdrawMatch[1]);
      if (!proposal) return json({ error: "Proposal not found" }, 404);
      const body = actorBodySchema.safeParse(readBody(init));
      const actor = body.success ? body.data.actor : undefined;
      if (!actor || !isParty(actor)) return malformed();

      const domain = fromProposalDto(proposal);
      if (effectiveProposalStatus(domain, now) === "EXPIRED") return conflict(EXPIRED_MESSAGE);
      if (!canAct(domain, actor, "withdraw", now)) return conflict(UNAVAILABLE_MESSAGE);
      for (const r of proposal.revisions) if (r.status === "SENT") r.status = nextStatus(REVISION_TRANSITIONS, "SENT", "withdraw") ?? r.status;
      move(proposal, "withdraw", actor, "WITHDRAW");
      return json(proposal);
    }

    // --- contracts ---
    const contractMatch = path.match(/^\/contracts\/([^/]+)$/);
    if (method === "GET" && contractMatch) {
      const contract = findContract(contractMatch[1]);
      return contract ? json(contract) : json({ error: "Contract not found" }, 404);
    }

    const signMatch = path.match(/^\/contracts\/([^/]+)\/sign$/);
    if (method === "POST" && signMatch) {
      const contract = findContract(signMatch[1]);
      if (!contract) return json({ error: "Contract not found" }, 404);
      const dto = signBodySchema.safeParse(readBody(init));
      if (!dto.success || !isParty(dto.data.party)) return malformed();
      const { party, party_id: partyId } = dto.data;

      const domain = fromContractDto(contract);
      if (!isContractParty(domain, party, partyId)) return conflict(SIGN_MESSAGES.not_party);
      const block = signBlock(domain, party, partyId);
      if (block) return conflict(SIGN_MESSAGES[block]);

      const signedAt = new Date().toISOString();
      const signature = { signed_at: signedAt, signer_name: party === "INVESTOR" ? contract.investor_name : contract.producer_name };
      if (party === "INVESTOR") contract.investor_signature = signature;
      else contract.producer_signature = signature;

      const proposal = findProposal(contract.proposal_id);
      if (proposal) appendHistory(proposal, party, "CONTRACT_SIGNED", null, null, { contract_id: contract.id, party });

      if (isFullySigned(fromContractDto(contract))) {
        contract.status = "SIGNED";
        contract.signed_at = signedAt;
        // The only write to the shared store: the project is now under contract (never moves a project backwards).
        const project = findProject(contract.project_id);
        if (project && project.current_status === "DRAFT") project.current_status = "CONTRACT_SIGNED";
      }
      return json(contract);
    }

    return delegate(input, init);
  };
}
