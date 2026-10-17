import type { CatalogProject, Contract, Party, Proposal } from "../domain/investment";
import type { ProposalTermsInput } from "../schemas/proposal-terms";

export interface PartyIdentity {
  id: string;
  name: string;
}

export interface ProposalFilter {
  investorId?: string;
  producerId?: string;
  projectId?: string;
}

// Port of the investments backend. Business refusals (400/409) surface as ValidationFailure; transport faults as NetworkError.
export interface InvestmentRepository {
  // Projects open to investment, with their milestones and quotation total.
  listCatalog(): Promise<CatalogProject[]>;
  getCatalogProject(projectId: string): Promise<CatalogProject | null>;

  listProposals(filter: ProposalFilter): Promise<Proposal[]>;
  getProposal(proposalId: string): Promise<Proposal | null>;
  createProposal(projectId: string, investor: PartyIdentity, input: ProposalTermsInput): Promise<Proposal>;
  counter(proposalId: string, author: Party, input: ProposalTermsInput): Promise<Proposal>;
  accept(proposalId: string, revision: number, actor: Party): Promise<Proposal>;
  reject(proposalId: string, revision: number, actor: Party): Promise<Proposal>;
  withdraw(proposalId: string, actor: Party): Promise<Proposal>;

  getContract(contractId: string): Promise<Contract | null>;
  signContract(contractId: string, party: Party, partyId: string): Promise<Contract>;
}
