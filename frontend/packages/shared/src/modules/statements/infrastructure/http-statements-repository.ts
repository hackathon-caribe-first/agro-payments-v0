import { toProjectGrants } from "../../grants/infrastructure/mapper";
import { toSettlements } from "../../harvest/infrastructure/mapper";
import type { Contract, Proposal } from "../../investments/domain/investment";
import { toContract, toProposals } from "../../investments/infrastructure/mapper";
import { toProjectLines } from "../../payment-lines/infrastructure/mapper";
import { JsonReader } from "../../panel/infrastructure/json-reader";
import { toProject } from "../../projects/infrastructure/mapper";
import type { StatementsRepository } from "../application/statements-repository";
import type { StatementSources } from "../domain/statement";

interface Options {
  baseUrl?: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

// Reads the endpoints that already exist (project, settlements, milestone payment lines, grants, proposals, contract) and hands
// their domain objects to the pure builders. Every source except the project is optional: a module that is down or has nothing
// for this project contributes nothing instead of breaking the document.
export class HttpStatementsRepository implements StatementsRepository {
  private readonly reader: JsonReader;

  constructor({ baseUrl, fetchFn }: Options) {
    this.reader = new JsonReader({ baseUrl, fetchFn });
  }

  async loadProjectSources(projectId: string): Promise<StatementSources | null> {
    const projectRaw = await this.reader.get(`/projects/${enc(projectId)}`);
    if (!projectRaw) return null;
    const project = toProject(projectRaw);
    const id = enc(project.id);

    const [settlementsRaw, linesRaw, grantsRaw, proposalsRaw] = await Promise.all([
      this.reader.getOptional(`/settlements/projects/${id}`),
      this.reader.getOptional(`/projects/${id}/milestone-lines`),
      this.reader.getOptional(`/projects/${id}/grants`),
      this.reader.getOptional(`/investments/proposals?project_id=${id}`),
    ]);

    const proposals: Proposal[] = proposalsRaw ? toProposals(proposalsRaw) : [];
    const proposal = proposals.filter((p) => p.status === "ACCEPTED" && p.contractId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const contractRaw = proposal?.contractId ? await this.reader.getOptional(`/contracts/${enc(proposal.contractId)}`) : null;
    const contract: Contract | null = contractRaw ? toContract(contractRaw) : null;
    const grantsView = grantsRaw ? toProjectGrants(grantsRaw) : null;

    return {
      project,
      settlements: settlementsRaw ? toSettlements(settlementsRaw) : [],
      lines: linesRaw ? toProjectLines(linesRaw) : null,
      grants: grantsView?.grants ?? [],
      grantMilestones: grantsView?.milestones ?? [],
      proposal,
      contract,
      generatedAt: new Date().toISOString(),
    };
  }
}
