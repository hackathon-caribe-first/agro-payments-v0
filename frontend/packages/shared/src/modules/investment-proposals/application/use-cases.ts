import { err, ok } from "../../milestones/domain/errors";
import { toFieldErrors } from "../../milestones/schemas/evidence-log";
import { attemptInvestment, type InvestmentError, type InvestmentResult, type ProposeBlock, type SignBlock } from "../domain/errors";
import type { Actor, CatalogProject, Contract, Party, Proposal } from "../domain/investment";
import { isContractParty, signBlock } from "../domain/contract-rules";
import {
  canAct,
  effectiveProposalStatus,
  effectiveRevisionStatus,
  isParty,
  isProposalLive,
  latestRevision,
  proposeBlock,
  whoseTurn,
} from "../domain/proposal-rules";
import { PROPOSAL_TRANSITIONS, nextStatus } from "../domain/transitions";
import { buildCounterSchema, buildProposalTermsSchema, revisionSchema } from "../schemas/proposal-terms";
import type { InvestmentRepository, PartyIdentity } from "./investment-repository";

export interface InvestmentDeps {
  investments: InvestmentRepository;
  // Injected clock (yyyy-mm-dd) so rules stay pure and testable.
  today: () => string;
}

// ---- read models ----

export interface InvestorCatalogEntry {
  catalog: CatalogProject;
  // Why the investor cannot propose on it; null when they can.
  block: ProposeBlock | null;
  // The investor's live proposal on the project, if any.
  myLiveProposalId: string | null;
}

export interface ProposalEntry {
  proposal: Proposal;
  // Whose move it is; null when the proposal has ended.
  turn: Actor | null;
}

export interface ProposalDetail extends ProposalEntry {
  // The project as the catalog shows it; null if it left the catalog (e.g. it moved on after the contract).
  catalog: CatalogProject | null;
  contract: Contract | null;
}

export interface ContractDetail {
  contract: Contract;
  // Why the viewer cannot sign now; null when they can.
  signBlock: SignBlock | null;
}

// Reads return the status a user should see today: lazy expiry is applied here, never stored.
export function withEffectiveStatus(proposal: Proposal, today: string): Proposal {
  return {
    ...proposal,
    status: effectiveProposalStatus(proposal, today),
    revisions: proposal.revisions.map((r) => ({ ...r, status: effectiveRevisionStatus(r, today) })),
  };
}

const toEntry = (proposal: Proposal, today: string): ProposalEntry => {
  const effective = withEffectiveStatus(proposal, today);
  return { proposal: effective, turn: whoseTurn(proposal, today) };
};

const invalidTransition = (from: string, action: string): InvestmentError => ({ kind: "invalid_transition", from, action });

// ---- catalog ----

function toCatalogEntry(catalog: CatalogProject, mine: Proposal[], today: string): InvestorCatalogEntry {
  const live = mine.find((p) => p.projectId === catalog.project.id && isProposalLive(p, today));
  return {
    catalog,
    block: proposeBlock({ projectStatus: catalog.project.currentStatus, contractLocked: catalog.contractLocked, hasLive: live !== undefined }),
    myLiveProposalId: live?.id ?? null,
  };
}

export const listInvestorCatalog = (deps: InvestmentDeps, investorId: string) =>
  attemptInvestment<InvestorCatalogEntry[]>(async () => {
    const [catalog, mine] = await Promise.all([deps.investments.listCatalog(), deps.investments.listProposals({ investorId })]);
    const today = deps.today();
    return ok(catalog.map((c) => toCatalogEntry(c, mine, today)));
  });

export const getInvestorProjectDetail = (deps: InvestmentDeps, projectId: string, investorId: string) =>
  attemptInvestment<InvestorCatalogEntry>(async () => {
    const catalog = await deps.investments.getCatalogProject(projectId);
    if (!catalog) return err({ kind: "not_found" });
    const mine = await deps.investments.listProposals({ investorId, projectId });
    return ok(toCatalogEntry(catalog, mine, deps.today()));
  });

// ---- proposals ----

// The investor's opening proposal. The amount can never exceed the project quotation total.
export const createInvestmentProposal = (deps: InvestmentDeps, projectId: string, investor: PartyIdentity, raw: unknown) =>
  attemptInvestment<Proposal>(async () => {
    const catalog = await deps.investments.getCatalogProject(projectId);
    if (!catalog) return err({ kind: "not_found" });
    const today = deps.today();
    const mine = await deps.investments.listProposals({ investorId: investor.id, projectId });
    const block = proposeBlock({
      projectStatus: catalog.project.currentStatus,
      contractLocked: catalog.contractLocked,
      hasLive: mine.some((p) => isProposalLive(p, today)),
    });
    if (block) return err({ kind: "not_proposable", reason: block });

    const parsed = buildProposalTermsSchema({ today, maxAmount: catalog.quotationTotal, currency: catalog.project.currency }).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.investments.createProposal(projectId, investor, parsed.data));
  });

export const listProposalsFor = (deps: InvestmentDeps, party: Party, partyId: string) =>
  attemptInvestment<ProposalEntry[]>(async () => {
    const proposals = await deps.investments.listProposals(party === "INVESTOR" ? { investorId: partyId } : { producerId: partyId });
    const today = deps.today();
    return ok(proposals.map((p) => toEntry(p, today)).sort((a, b) => b.proposal.createdAt.localeCompare(a.proposal.createdAt)));
  });

// A party only sees their own proposals: anything else reads as not found.
async function loadProposal(deps: InvestmentDeps, proposalId: string, party: Party, partyId: string): Promise<Proposal | null> {
  const proposal = await deps.investments.getProposal(proposalId);
  return proposal && isParty(proposal, party, partyId) ? proposal : null;
}

export const getProposalDetail = (deps: InvestmentDeps, proposalId: string, party: Party, partyId: string) =>
  attemptInvestment<ProposalDetail>(async () => {
    const proposal = await loadProposal(deps, proposalId, party, partyId);
    if (!proposal) return err({ kind: "not_found" });
    const [catalog, contract] = await Promise.all([
      deps.investments.getCatalogProject(proposal.projectId),
      proposal.contractId ? deps.investments.getContract(proposal.contractId) : Promise.resolve(null),
    ]);
    return ok({ ...toEntry(proposal, deps.today()), catalog, contract });
  });

// Either party's counter-offer, on their turn.
export const counterProposal = (deps: InvestmentDeps, proposalId: string, party: Party, partyId: string, raw: unknown) =>
  attemptInvestment<Proposal>(async () => {
    const proposal = await loadProposal(deps, proposalId, party, partyId);
    if (!proposal) return err({ kind: "not_found" });
    const today = deps.today();
    const status = effectiveProposalStatus(proposal, today);
    if (!nextStatus(PROPOSAL_TRANSITIONS, status, "counter")) return err(invalidTransition(status, "counter"));
    if (!canAct(proposal, party, "counter", today)) return err({ kind: "not_your_turn", turn: whoseTurn(proposal, today) });
    const latest = latestRevision(proposal);
    if (!latest) return err(invalidTransition(status, "counter"));

    const parsed = buildCounterSchema({ today, maxAmount: proposal.projectTotal, currency: proposal.currency, latest }).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.investments.counter(proposalId, party, parsed.data));
  });

// Decisions always target the LATEST revision, and only the party whose turn it is may decide.
type Decision = { failure: InvestmentError; revision?: undefined } | { failure?: undefined; revision: number };

async function decide(
  deps: InvestmentDeps,
  proposalId: string,
  rawRevision: unknown,
  party: Party,
  partyId: string,
  action: "accept" | "reject",
): Promise<Decision> {
  const proposal = await loadProposal(deps, proposalId, party, partyId);
  if (!proposal) return { failure: { kind: "not_found" } };
  const revision = revisionSchema.safeParse(rawRevision);
  if (!revision.success) return { failure: { kind: "validation", fieldErrors: { _form: ["Revisión inválida."] } } };
  const today = deps.today();
  const status = effectiveProposalStatus(proposal, today);
  const latest = latestRevision(proposal);
  if (!latest || latest.revision !== revision.data) return { failure: invalidTransition(status, action) };
  if (!nextStatus(PROPOSAL_TRANSITIONS, status, action)) return { failure: invalidTransition(status, action) };
  if (!canAct(proposal, party, action, today)) return { failure: { kind: "not_your_turn", turn: whoseTurn(proposal, today) } };
  return { revision: revision.data };
}

// Accepting by either side generates the contract (the server does it in the same step).
export const acceptProposal = (deps: InvestmentDeps, proposalId: string, rawRevision: unknown, party: Party, partyId: string) =>
  attemptInvestment<Proposal>(async () => {
    const decision = await decide(deps, proposalId, rawRevision, party, partyId, "accept");
    if (decision.failure) return err(decision.failure);
    return ok(await deps.investments.accept(proposalId, decision.revision, party));
  });

export const rejectProposal = (deps: InvestmentDeps, proposalId: string, rawRevision: unknown, party: Party, partyId: string) =>
  attemptInvestment<Proposal>(async () => {
    const decision = await decide(deps, proposalId, rawRevision, party, partyId, "reject");
    if (decision.failure) return err(decision.failure);
    return ok(await deps.investments.reject(proposalId, decision.revision, party));
  });

// Only the investor withdraws; the producer's way out is rejecting on their turn.
export const withdrawProposal = (deps: InvestmentDeps, proposalId: string, party: Party, partyId: string) =>
  attemptInvestment<Proposal>(async () => {
    const proposal = await loadProposal(deps, proposalId, party, partyId);
    if (!proposal) return err({ kind: "not_found" });
    const today = deps.today();
    if (!canAct(proposal, party, "withdraw", today)) return err(invalidTransition(effectiveProposalStatus(proposal, today), "withdraw"));
    return ok(await deps.investments.withdraw(proposalId, party));
  });

// ---- contracts ----

export const getContractDetail = (deps: InvestmentDeps, contractId: string, party: Party, partyId: string) =>
  attemptInvestment<ContractDetail>(async () => {
    const contract = await deps.investments.getContract(contractId);
    if (!contract || !isContractParty(contract, party, partyId)) return err({ kind: "not_found" });
    return ok({ contract, signBlock: signBlock(contract, party, partyId) });
  });

export const signContract = (deps: InvestmentDeps, contractId: string, party: Party, partyId: string): Promise<InvestmentResult<Contract>> =>
  attemptInvestment<Contract>(async () => {
    const contract = await deps.investments.getContract(contractId);
    if (!contract || !isContractParty(contract, party, partyId)) return err({ kind: "not_found" });
    const block = signBlock(contract, party, partyId);
    if (block) return err({ kind: "not_signable", reason: block });
    return ok(await deps.investments.signContract(contractId, party, partyId));
  });
