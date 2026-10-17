import { Injectable } from "@nestjs/common";
import { addEvidenceLog, type EvidenceLogRequest, progressStatus, submitForReview } from "../../milestones/application/milestone-progress";
import { MilestoneRepository } from "../../milestones/ports/milestone.repository";
import type { Viewer } from "./project";
import { type MilestoneView, ProjectQueries } from "./project-queries";

// The producer's field log and submission (PRD evidence_logs). Load → apply a rule → save, like MilestoneStore.
// ponytail: last write wins, same as MilestoneStore; two logs posted at once can drop one. Add a version column if that happens.
@Injectable()
export class MilestoneEvidenceUseCase {
  constructor(
    private readonly queries: ProjectQueries,
    private readonly milestones: MilestoneRepository,
  ) {}

  async addLog(id: string, viewer: Viewer, request: EvidenceLogRequest) {
    const { milestone, siblings, gate } = await this.queries.load(id, viewer);
    const next = addEvidenceLog(milestone, siblings, request, new Date(), gate);
    await this.milestones.save(next);
    return next.evidenceLogs.at(-1)!;
  }

  async submit(id: string, viewer: Viewer): Promise<MilestoneView> {
    const { milestone, siblings, gate } = await this.queries.load(id, viewer);
    const next = submitForReview(milestone, siblings, new Date(), gate);
    await this.milestones.save(next);
    return { milestone: next, status: progressStatus(next, siblings, gate) };
  }
}
