import { Injectable } from "@nestjs/common";
import { NotFoundError } from "../../../shared/domain-errors";
import type { Milestone } from "../../milestones/application/milestone";
import { type ProgressStatus, progressStatus } from "../../milestones/application/milestone-progress";
import { MilestoneRepository } from "../../milestones/ports/milestone.repository";
import { ProjectRepository } from "../ports/project.repository";
import { canView, type Project, type Viewer } from "./project";

/** A milestone with the PRD status derived from its project siblings. */
export type MilestoneView = { milestone: Milestone; status: ProgressStatus };

export const viewsOf = (milestones: Milestone[]): MilestoneView[] => milestones.map((m) => ({ milestone: m, status: progressStatus(m, milestones) }));

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

  async get(id: string, viewer: Viewer): Promise<Project> {
    const project = await this.projects.findById(id);
    if (!project || !canView(project, viewer)) throw new NotFoundError(`Project ${id} not found`);
    return project;
  }

  async milestones(projectId: string, viewer: Viewer): Promise<MilestoneView[]> {
    await this.get(projectId, viewer);
    return viewsOf(await this.milestoneRepository.findByProject(projectId));
  }

  async milestone(id: string, viewer: Viewer): Promise<MilestoneView> {
    const { milestone, siblings } = await this.load(id, viewer);
    return { milestone, status: progressStatus(milestone, siblings) };
  }

  /** The milestone and its project siblings, after the access check. Legacy demo milestones have no project and no siblings. */
  async load(id: string, viewer: Viewer): Promise<{ milestone: Milestone; siblings: Milestone[] }> {
    const milestone = await this.milestoneRepository.findById(id);
    if (!milestone) throw new NotFoundError(`Milestone ${id} not found`);
    if (milestone.projectId === null) return { milestone, siblings: [] };
    await this.get(milestone.projectId, viewer).catch(() => {
      throw new NotFoundError(`Milestone ${id} not found`);
    });
    return { milestone, siblings: await this.milestoneRepository.findByProject(milestone.projectId) };
  }
}
