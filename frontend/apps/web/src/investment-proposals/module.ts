import { INVESTOR_IDENTITY } from "@agro/shared/modules/presales/infrastructure/mock/identities";
import { createInvestmentsModule } from "@agro/shared/modules/investment-proposals/infrastructure/investments-module";
import { API_BASE_URL, prototypeTransport } from "~/platform/transport";
import { PRODUCER_PROFILE } from "~/producer/presales";

// There is no authentication yet: the investor is a fixed profile.
// Keep in sync with SEED_INVESTOR in the shared investments mock state (the seeded proposals are stamped with it).
export const INVESTOR_PROFILE = { id: INVESTOR_IDENTITY.id, name: INVESTOR_IDENTITY.name } as const;

// INTEGRATION: `transport` (~/platform/transport) must chain createInvestmentsMockFetch(store, ...) in the mock
// transport, otherwise /investor/catalog, /investments/** and /contracts/** are not served. See routes/investment.integration.md.
const investments = createInvestmentsModule({ fetchFn: prototypeTransport, baseUrl: API_BASE_URL });

// Investor-side operations. Every write acts as INVESTOR.
export const investor = {
  listCatalog: () => investments.listInvestorCatalog(INVESTOR_PROFILE.id),
  getProjectDetail: (projectId: string) => investments.getInvestorProjectDetail(projectId, INVESTOR_PROFILE.id),
  createProposal: (projectId: string, raw: unknown) => investments.createProposal(projectId, INVESTOR_PROFILE, raw),

  listProposals: () => investments.listProposals("INVESTOR", INVESTOR_PROFILE.id),
  getProposalDetail: (proposalId: string) => investments.getProposalDetail(proposalId, "INVESTOR", INVESTOR_PROFILE.id),
  counter: (proposalId: string, raw: unknown) => investments.counter(proposalId, "INVESTOR", INVESTOR_PROFILE.id, raw),
  accept: (proposalId: string, revision: unknown) => investments.accept(proposalId, revision, "INVESTOR", INVESTOR_PROFILE.id),
  reject: (proposalId: string, revision: unknown) => investments.reject(proposalId, revision, "INVESTOR", INVESTOR_PROFILE.id),
  withdraw: (proposalId: string) => investments.withdraw(proposalId, "INVESTOR", INVESTOR_PROFILE.id),

  getContractDetail: (contractId: string) => investments.getContractDetail(contractId, "INVESTOR", INVESTOR_PROFILE.id),
  signContract: (contractId: string) => investments.signContract(contractId, "INVESTOR", INVESTOR_PROFILE.id),
};

// Producer-side operations on the same proposals. The producer answers; they never start a proposal.
export const producerInvestments = {
  listProposals: () => investments.listProposals("PRODUCER", PRODUCER_PROFILE.id),
  getProposalDetail: (proposalId: string) => investments.getProposalDetail(proposalId, "PRODUCER", PRODUCER_PROFILE.id),
  counter: (proposalId: string, raw: unknown) => investments.counter(proposalId, "PRODUCER", PRODUCER_PROFILE.id, raw),
  accept: (proposalId: string, revision: unknown) => investments.accept(proposalId, revision, "PRODUCER", PRODUCER_PROFILE.id),
  reject: (proposalId: string, revision: unknown) => investments.reject(proposalId, revision, "PRODUCER", PRODUCER_PROFILE.id),

  getContractDetail: (contractId: string) => investments.getContractDetail(contractId, "PRODUCER", PRODUCER_PROFILE.id),
  signContract: (contractId: string) => investments.signContract(contractId, "PRODUCER", PRODUCER_PROFILE.id),
};
