import { Injectable } from "@nestjs/common";
import { NotFoundError } from "../../../shared/domain-errors";
import type { Milestone } from "../../milestones/application/milestone";
import { type CustodyGate, type ProgressStatus, progressStatus } from "../../milestones/application/milestone-progress";
import { MilestoneRepository } from "../../milestones/ports/milestone.repository";
import { isInBuyerCatalog } from "../../negotiations/domain/project-rules";
import { ProjectRepository } from "../ports/project.repository";
import { canView, custodyGate, type Project, type Viewer } from "./project";

/** A milestone with the PRD status derived from its project siblings. */
export type MilestoneView = { milestone: Milestone; status: ProgressStatus };

export const viewsOf = (milestones: Milestone[], gate?: CustodyGate): MilestoneView[] =>
  milestones.map((m) => ({ milestone: m, status: progressStatus(m, milestones, gate) }));

/** A buyer reads the projects of the buyer catalog (negotiations); everyone else follows canView (a producer only their own). */
const canRead = (project: Project, viewer: Viewer) => (viewer.role === "buyer" ? isInBuyerCatalog(project.currentStatus) : canView(project, viewer));

// Reads scoped to the viewer. A project the viewer may not see is reported as not found, so ids never leak.
@Injectable()
export class ProjectQueries {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly milestoneRepository: MilestoneRepository,
  ) {}

  listOwned(viewer: Viewer) {
    return this.projects.findByOwner(viewer.id);
  }

  /** Every project, oldest first. Only the operator route (admin, fidu) calls it: canView already lets both read any project. */
  listAll() {
    return this.projects.findAll();
  }

  async get(id: string, viewer: Viewer): Promise<Project> {
    const project = await this.projects.findById(id);
    if (!project || !canRead(project, viewer)) throw new NotFoundError(`Project ${id} not found`);
    return project;
  }

  async milestones(projectId: string, viewer: Viewer): Promise<MilestoneView[]> {
    const project = await this.get(projectId, viewer);
    return viewsOf(await this.milestoneRepository.findByProject(projectId), custodyGate(project));
  }

  async milestone(id: string, viewer: Viewer): Promise<MilestoneView> {
    const { milestone, siblings, gate } = await this.load(id, viewer, canRead);
    return { milestone, status: progressStatus(milestone, siblings, gate) };
  }

  /** The milestone, its project siblings and custody gate, after the access check. Legacy demo milestones have no project, siblings or gate. */
  async load(id: string, viewer: Viewer, allowed: (project: Project, viewer: Viewer) => boolean = canView): Promise<{ milestone: Milestone; siblings: Milestone[]; gate?: CustodyGate }> {
    const milestone = await this.milestoneRepository.findById(id);
    if (!milestone) throw new NotFoundError(`Milestone ${id} not found`);
    if (milestone.projectId === null) {
      // Legacy demo milestones belong to no catalog project: a buyer never reads them.
      if (viewer.role === "buyer") throw new NotFoundError(`Milestone ${id} not found`);
      return { milestone, siblings: [] };
    }
    // Evidence writes keep canView (the default); only the milestone detail read admits the buyer's catalog rule.
    const project = await this.projects.findById(milestone.projectId);
    if (!project || !allowed(project, viewer)) throw new NotFoundError(`Milestone ${id} not found`);
    return { milestone, siblings: await this.milestoneRepository.findByProject(milestone.projectId), gate: custodyGate(project) };
  }
}
