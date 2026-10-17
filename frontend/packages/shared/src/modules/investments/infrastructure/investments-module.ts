import {
  acceptProposal,
  counterProposal,
  createInvestmentProposal,
  getContractDetail,
  getInvestorProjectDetail,
  getProposalDetail,
  listInvestorCatalog,
  listProposalsFor,
  rejectProposal,
  signContract,
  withdrawProposal,
  type InvestmentDeps,
} from "../application/use-cases";
import type { PartyIdentity } from "../application/investment-repository";
import { isoToday } from "../domain/proposal-rules";
import { HttpInvestmentRepository } from "./http-investment-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
  today?: () => string;
}

const DEFAULT_BASE_URL = "/api";

// Binds every investment use case to one repository over the given transport.
// Party-neutral on purpose: the investor and producer wrappers in apps/web pass their own identity.
export function createInvestmentsModule({ fetchFn, baseUrl = DEFAULT_BASE_URL, today = isoToday }: Options) {
  const deps: InvestmentDeps = { investments: new HttpInvestmentRepository({ baseUrl, fetchFn }), today };

  return {
    listInvestorCatalog: (investorId: string) => listInvestorCatalog(deps, investorId),
    getInvestorProjectDetail: (projectId: string, investorId: string) => getInvestorProjectDetail(deps, projectId, investorId),
    createProposal: (projectId: string, investor: PartyIdentity, raw: unknown) => createInvestmentProposal(deps, projectId, investor, raw),

    listProposals: (party: "INVESTOR" | "PRODUCER", partyId: string) => listProposalsFor(deps, party, partyId),
    getProposalDetail: (proposalId: string, party: "INVESTOR" | "PRODUCER", partyId: string) => getProposalDetail(deps, proposalId, party, partyId),
    counter: (proposalId: string, party: "INVESTOR" | "PRODUCER", partyId: string, raw: unknown) =>
      counterProposal(deps, proposalId, party, partyId, raw),
    accept: (proposalId: string, revision: unknown, party: "INVESTOR" | "PRODUCER", partyId: string) =>
      acceptProposal(deps, proposalId, revision, party, partyId),
    reject: (proposalId: string, revision: unknown, party: "INVESTOR" | "PRODUCER", partyId: string) =>
      rejectProposal(deps, proposalId, revision, party, partyId),
    withdraw: (proposalId: string, party: "INVESTOR" | "PRODUCER", partyId: string) => withdrawProposal(deps, proposalId, party, partyId),

    getContractDetail: (contractId: string, party: "INVESTOR" | "PRODUCER", partyId: string) => getContractDetail(deps, contractId, party, partyId),
    signContract: (contractId: string, party: "INVESTOR" | "PRODUCER", partyId: string) => signContract(deps, contractId, party, partyId),
  };
}

export type InvestmentsModule = ReturnType<typeof createInvestmentsModule>;
