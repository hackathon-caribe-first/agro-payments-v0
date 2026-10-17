import type { GrantDetail } from "../../grants/domain/grant";
import { toGrantDetail, toProjectGrants } from "../../grants/infrastructure/mapper";
import { toDeclarationContext, toSettlements } from "../../harvest-batches/infrastructure/mapper";
import { toProposals } from "../../investment-proposals/infrastructure/mapper";
import { toMilestoneSummaries } from "../../milestones/infrastructure/mapper";
import { toPaymentAuthorizations } from "../../payment-authorization/infrastructure/mapper";
import { JsonReader } from "../../panel/infrastructure/json-reader";
import { toQuoteRequests } from "../../presales/infrastructure/mapper";
import { toProject } from "../../projects/infrastructure/mapper";
import { toReviewDetail } from "../../reviews/infrastructure/mapper";
import type { AuditRepository } from "../application/audit-repository";
import type { AuditSources, MilestoneHistory } from "../domain/build-audit";

interface Options {
  baseUrl?: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

// Reads the endpoints that already exist and hands their domain objects to the pure builder. Every source except the
// project itself is optional: a module that is down or has nothing for this project simply contributes no entries.
export class HttpAuditRepository implements AuditRepository {
  private readonly reader: JsonReader;

  constructor({ baseUrl, fetchFn }: Options) {
    this.reader = new JsonReader({ baseUrl, fetchFn });
  }

  async loadProjectSources(projectId: string): Promise<AuditSources | null> {
    const projectRaw = await this.reader.get(`/projects/${enc(projectId)}`);
    if (!projectRaw) return null;
    const project = toProject(projectRaw);
    const id = enc(project.id);

    const [milestonesRaw, proposalsRaw, negotiationsRaw, grantsRaw, authorizationsRaw, harvestRaw, settlementsRaw] = await Promise.all([
      this.reader.getOptional(`/projects/${id}/milestones`),
      this.reader.getOptional(`/investments/proposals?project_id=${id}`),
      this.reader.getOptional(`/producer/quote-requests?project_id=${id}`),
      this.reader.getOptional(`/projects/${id}/grants`),
      this.reader.getOptional(`/projects/${id}/payment-authorizations`),
      this.reader.getOptional(`/harvest/projects/${id}/declaration`),
      this.reader.getOptional(`/settlements/projects/${id}`),
    ]);

    const milestones = milestonesRaw ? toMilestoneSummaries(milestonesRaw) : [];
    const grantIds = grantsRaw ? toProjectGrants(grantsRaw).grants.map((g) => g.id) : [];
    const [reviewRaws, grantRaws] = await Promise.all([
      Promise.all(milestones.map((m) => this.reader.getOptional(`/reviews/${enc(m.id)}?verifier_id=audit`))),
      Promise.all(grantIds.map((gid) => this.reader.getOptional(`/grants/${enc(gid)}`))),
    ]);

    const milestoneHistories: MilestoneHistory[] = reviewRaws.flatMap((raw) => {
      if (!raw) return [];
      const detail = toReviewDetail(raw);
      return [{ milestone: { id: detail.milestone.id, sequenceOrder: detail.milestone.sequenceOrder, title: detail.milestone.title }, history: detail.history }];
    });
    const proposals = proposalsRaw ? toProposals(proposalsRaw) : [];
    const grants: GrantDetail[] = grantRaws.flatMap((raw) => (raw ? [toGrantDetail(raw)] : []));

    return {
      project,
      milestoneHistories,
      proposals,
      negotiations: negotiationsRaw ? toQuoteRequests(negotiationsRaw) : [],
      grants,
      authorizations: authorizationsRaw ? toPaymentAuthorizations(authorizationsRaw) : [],
      batches: harvestRaw ? toDeclarationContext(harvestRaw).batches : [],
      settlements: settlementsRaw ? toSettlements(settlementsRaw) : [],
      investorName: proposals[0]?.investorName ?? "Inversor",
    };
  }
}
