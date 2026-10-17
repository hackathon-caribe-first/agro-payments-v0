import type { MilestoneRepository } from "../../milestones/application/milestone-repository";
import { attempt } from "../../milestones/application/use-cases";
import { err, ok, type FieldErrors, type MilestoneError } from "../../milestones/domain/errors";
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
import type { WalletCheck, WalletValidator } from "./wallet-validator";

export interface Repositories {
  projects: ProjectRepository;
  milestones: MilestoneRepository;
  // RF-01: validates the producer wallet before saving. Optional so modules without payment lines still compose.
  wallets?: WalletValidator;
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

export const WALLET_REQUIRED_MESSAGE = "Ingresa la billetera del productor.";

// RF-01: "Validar billetera" in the project form. Same check the creation runs before saving.
export const validateProducerWallet = ({ wallets }: Repositories, walletAddress: string) =>
  attempt<Extract<WalletCheck, { valid: true }>>(async () => {
    if (walletAddress.trim() === "") return err({ kind: "validation", fieldErrors: { producerWallet: [WALLET_REQUIRED_MESSAGE] } });
    if (!wallets) return err({ kind: "boundary", message: "La validación de billeteras no está disponible." });
    const check = await wallets.check(walletAddress);
    if (!check.valid) return err({ kind: "validation", fieldErrors: { producerWallet: [check.message] } });
    return ok(check);
  });

export interface CreateProjectOptions {
  // The project form requires the producer wallet; other callers (imports, tests) may create projects without it.
  requireProducerWallet?: boolean;
}

// Validation runs here, before the repository is touched. A wallet that is present is always validated first (RF-01).
export const createProject = (repos: Repositories, raw: unknown, { requireProducerWallet = false }: CreateProjectOptions = {}) =>
  attempt<Project>(async () => {
    const parsed = createProjectInputSchema.safeParse(raw);
    const fieldErrors: FieldErrors = parsed.success ? {} : toFieldErrors(parsed.error);
    const wallet = parsed.success ? parsed.data.producerWallet : undefined;
    const rawWallet = (raw as { producerWallet?: unknown } | null)?.producerWallet;
    const hasWallet = typeof rawWallet === "string" && rawWallet.trim() !== "";

    if (requireProducerWallet && !hasWallet) fieldErrors.producerWallet = [WALLET_REQUIRED_MESSAGE];
    let checked: Extract<WalletCheck, { valid: true }> | null = null;
    if (hasWallet && repos.wallets && !fieldErrors.producerWallet) {
      const check = await repos.wallets.check(String(rawWallet));
      if (check.valid) checked = check;
      else fieldErrors.producerWallet = [check.message];
    }
    if (!parsed.success || Object.keys(fieldErrors).length > 0) return err({ kind: "validation", fieldErrors });

    const input = checked ? { ...parsed.data, producerWallet: checked.url } : wallet ? { ...parsed.data, producerWallet: wallet } : parsed.data;
    return ok(await repos.projects.create(input));
  });
