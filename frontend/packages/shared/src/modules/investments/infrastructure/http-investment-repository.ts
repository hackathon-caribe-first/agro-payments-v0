import { NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { readFieldErrors } from "../../projects/infrastructure/http-project-repository";
import type { InvestmentRepository, PartyIdentity, ProposalFilter } from "../application/investment-repository";
import type { Party } from "../domain/investment";
import type { ProposalTermsInput } from "../schemas/proposal-terms";
import { toCatalogProject, toCatalogProjects, toContract, toCounterBody, toCreateProposalBody, toProposal, toProposals } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

export class HttpInvestmentRepository implements InvestmentRepository {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor({ baseUrl, fetchFn }: Options) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchFn = fetchFn;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
    }
  }

  // 400 (invalid input) and 409 (business conflict) share one body shape and both surface as field/form errors.
  private async json(response: Response): Promise<unknown> {
    if (response.status === 400 || response.status === 409) throw new ValidationFailure(await readFieldErrors(response));
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return response.json();
  }

  private post(path: string, body?: unknown) {
    return this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  // ---- catalog ----

  async listCatalog() {
    return toCatalogProjects(await this.json(await this.request("/investor/catalog")));
  }

  async getCatalogProject(projectId: string) {
    const response = await this.request(`/investor/catalog/${enc(projectId)}`);
    if (response.status === 404) return null;
    return toCatalogProject(await this.json(response));
  }

  // ---- proposals ----

  async listProposals(filter: ProposalFilter) {
    const params = new URLSearchParams();
    if (filter.investorId) params.set("investor_id", filter.investorId);
    if (filter.producerId) params.set("producer_id", filter.producerId);
    if (filter.projectId) params.set("project_id", filter.projectId);
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return toProposals(await this.json(await this.request(`/investments/proposals${query}`)));
  }

  async getProposal(proposalId: string) {
    const response = await this.request(`/investments/proposals/${enc(proposalId)}`);
    if (response.status === 404) return null;
    return toProposal(await this.json(response));
  }

  async createProposal(projectId: string, investor: PartyIdentity, input: ProposalTermsInput) {
    return toProposal(await this.json(await this.post("/investments/proposals", toCreateProposalBody(projectId, investor, input))));
  }

  async counter(proposalId: string, author: Party, input: ProposalTermsInput) {
    return toProposal(await this.json(await this.post(`/investments/proposals/${enc(proposalId)}/counter`, toCounterBody(author, input))));
  }

  async accept(proposalId: string, revision: number, actor: Party) {
    return toProposal(await this.json(await this.post(`/investments/proposals/${enc(proposalId)}/revisions/${revision}/accept`, { actor })));
  }

  async reject(proposalId: string, revision: number, actor: Party) {
    return toProposal(await this.json(await this.post(`/investments/proposals/${enc(proposalId)}/revisions/${revision}/reject`, { actor })));
  }

  async withdraw(proposalId: string, actor: Party) {
    return toProposal(await this.json(await this.post(`/investments/proposals/${enc(proposalId)}/withdraw`, { actor })));
  }

  // ---- contracts ----

  async getContract(contractId: string) {
    const response = await this.request(`/contracts/${enc(contractId)}`);
    if (response.status === 404) return null;
    return toContract(await this.json(response));
  }

  async signContract(contractId: string, party: Party, partyId: string) {
    return toContract(await this.json(await this.post(`/contracts/${enc(contractId)}/sign`, { party, party_id: partyId })));
  }
}
