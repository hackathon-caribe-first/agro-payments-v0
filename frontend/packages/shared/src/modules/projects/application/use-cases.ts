import type { MilestoneRepository } from "../../milestones/application/milestone-repository";
import { attempt } from "../../milestones/application/use-cases";
import { err, ok, type MilestoneError } from "../../milestones/domain/errors";
import type { MilestoneSummary } from "../../milestones/domain/milestone";
import type { Project } from "../domain/project";
import {
  dashboardSummary,
  isActive,
  isDraft,
  isFinished,
  milestoneProgress,
  quotationProgress,
  type DashboardSummary,
  type MilestoneProgress,
  type QuotationProgress,
} from "../domain/project-rules";
import { createProjectInputSchema } from "../schemas/create-project";
import { toFieldErrors } from "../../milestones/schemas/evidence-log";
import type { ProjectRepository } from "./project-repository";

export interface Repositories {
  projects: ProjectRepository;
  milestones: MilestoneRepository;
}

export interface ProjectOverview {
  project: Project;
  quotation: QuotationProgress;
  progress: MilestoneProgress;
}

export interface ProducerDashboard {
  summary: DashboardSummary;
  drafts: ProjectOverview[];
  active: ProjectOverview[];
  finished: ProjectOverview[];
}

export interface ProjectWithMilestones {
  project: Project;
  milestones: MilestoneSummary[];
}

const bySequence = (a: MilestoneSummary, b: MilestoneSummary) => a.sequenceOrder - b.sequenceOrder;
const byEndDate = (a: ProjectOverview, b: ProjectOverview) =>
  a.project.estimatedEndDate.localeCompare(b.project.estimatedEndDate);

export const getProducerDashboard = ({ projects, milestones }: Repositories) =>
  attempt<ProducerDashboard>(async () => {
    const list = await projects.listProducerProjects();
    const entries = await Promise.all(
      list.map(async (project) => ({ project, milestones: await milestones.listByProject(project.id) })),
    );
    const overview = ({ project, milestones: ms }: (typeof entries)[number]): ProjectOverview => ({
      project,
      quotation: quotationProgress(ms),
      progress: milestoneProgress(ms),
    });
    return ok({
      summary: dashboardSummary(entries),
      drafts: entries.filter((e) => isDraft(e.project)).map(overview).sort(byEndDate),
      active: entries.filter((e) => isActive(e.project)).map(overview).sort(byEndDate),
      finished: entries.filter((e) => isFinished(e.project)).map(overview).sort(byEndDate),
    });
  });

export const getProjectWithMilestones = ({ projects, milestones }: Repositories, projectId: string) =>
  attempt<ProjectWithMilestones>(async () => {
    const project = await projects.getProject(projectId);
    if (!project) return err({ kind: "not_found" });
    return ok({ project, milestones: [...(await milestones.listByProject(projectId))].sort(bySequence) });
  });

// Same error shape as the milestones area: validation{fieldErrors}, network, boundary.
export type ProjectError = MilestoneError;

// Validation runs here, before the repository is touched.
export const createProject = ({ projects }: Repositories, raw: unknown) =>
  attempt<Project>(async () => {
    const parsed = createProjectInputSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await projects.create(parsed.data));
  });
