import { Injectable } from "@nestjs/common";
import { NotFoundError } from "../../../shared/domain-errors";
import type { Role } from "../../auth/ports/role";
import { captureSummary, type CaptureSummary, type Investment } from "../../investments/domain/investment";
import { MilestoneRepository } from "../../milestones/ports/milestone.repository";
import { canView, custodyGate, type Project, type Viewer } from "../../projects/application/project";
import { type MilestoneView, viewsOf } from "../../projects/application/project-queries";
import type { Payout } from "../../settlement/application/settlement";
import { type CustodyStatement, custodyStatement, type GrantView, investorCurrencyOf, type Median, medianReturns, milestoneGrant, type Realized, realizedReturns } from "../domain/panel";
import { HarvestStore } from "../ports/harvest-store";
import { PanelSources } from "../ports/panel-sources";

export type InvestorPanel = {
  project: Project;
  capture: CaptureSummary;
  custody: CustodyStatement;
  milestones: (MilestoneView & { grant: GrantView })[];
  /** The caller's investments (every one for the fiduciaria and the operator), each with its liquidation payouts. */
  myInvestments: { investment: Investment; payouts: Payout[] }[];
  realized: Realized;
  median: Median | null;
};

const PANEL_ROLES: readonly Role[] = ["investor", "fidu", "admin"];
// The verifier reads custody where a milestone is observed (RF-21).
const CUSTODY_EXTRA: readonly Role[] = ["verifier"];

// RF-27 investor panel and RF-21 custody balance: reads only, over the other modules' read ports.
@Injectable()
export class InvestorPanelUseCases {
  constructor(
    private readonly store: HarvestStore,
    private readonly milestoneRepository: MilestoneRepository,
    private readonly sources: PanelSources,
  ) {}

  private async project(id: string, viewer: Viewer, extra: readonly Role[] = []): Promise<Project> {
    const project = await this.store.findProject(id);
    if (!project || !(canView(project, viewer) || extra.includes(viewer.role))) throw new NotFoundError(`Project ${id} not found`);
    return project;
  }

  private async statement(project: Project): Promise<CustodyStatement> {
    const [credits, debits, milestones, settlements] = await Promise.all([
      this.store.creditsByCategory(project.id),
      this.store.debitsByCategory(project.id),
      this.milestoneRepository.findByProject(project.id),
      this.sources.settlements(project.id),
    ]);
    return custodyStatement(project, { credits, debits }, milestones, settlements);
  }

  async custody(projectId: string, viewer: Viewer): Promise<CustodyStatement> {
    return this.statement(await this.project(projectId, viewer, CUSTODY_EXTRA));
  }

  async panel(projectId: string, viewer: Viewer): Promise<InvestorPanel> {
    if (!PANEL_ROLES.includes(viewer.role)) throw new NotFoundError(`Project ${projectId} not found`);
    const project = await this.project(projectId, viewer);
    const [investments, milestones, settlements, run, custody] = await Promise.all([
      this.sources.investments(projectId),
      this.milestoneRepository.findByProject(projectId),
      this.sources.settlements(projectId),
      this.sources.latestSimulation(projectId),
      this.statement(project),
    ]);
    const mine = viewer.role === "investor" ? investments.filter((i) => i.investorUserId === viewer.id) : investments;
    const payoutsOf = (i: Investment) => settlements.flatMap((s) => s.payouts.filter((p) => p.id === `investor-${i.id}`));
    return {
      project,
      capture: captureSummary(project, investments),
      custody,
      milestones: viewsOf(milestones, custodyGate(project)).map((v) => ({ ...v, grant: milestoneGrant(v.milestone) })),
      myInvestments: mine.map((investment) => ({ investment, payouts: payoutsOf(investment) })),
      realized: realizedReturns(mine, settlements),
      median: medianReturns(run, investorCurrencyOf(mine)),
    };
  }
}
