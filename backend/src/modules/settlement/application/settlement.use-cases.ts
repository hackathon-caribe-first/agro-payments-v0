import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { DomainError, NotFoundError, ValidationError } from "../../../shared/domain-errors";
import type { LineResult } from "../../milestones/application/milestone";
import { PaymentGateway } from "../../milestones/ports/payment-gateway";
import { canView, PROJECT_STATUS, type Project, type ProjectWallets, type Viewer } from "../../projects/application/project";
import { PROJECT_WALLETS } from "../../projects/application/project-wallets";
import { ProjectRepository } from "../../projects/ports/project.repository";
import { CapturedInvestors } from "../ports/captured-investors";
import { SettlementRepository } from "../ports/settlement.repository";
import { PREFERRED_RATE_BPS } from "./liquidation";
import {
  ACTIVE_STATUSES,
  applyPayoutResult,
  approveSettlement,
  createSettlement,
  type InvestorPosition,
  PAYOUT_STATUS,
  planPayouts,
  type Settlement,
  SETTLEMENT_STATUS,
  type SettlementTerms,
  startExecution,
} from "./settlement";

/** Terms as the API sends them; null days means the project's cycle (start to estimated end), null investors its captured investments. */
export type SettlementRequest = Omit<SettlementTerms, "days" | "investors"> & { days: number | null; investors: InvestorPosition[] | null };

const DAY_MS = 86_400_000;
const cycleDays = (p: Project) => Math.max(0, Math.round((Date.parse(`${p.estimatedEndDate}T00:00:00Z`) - Date.parse(`${p.startDate}T00:00:00Z`)) / DAY_MS));

// ponytail: proceeds come in the request; L will come from the custody balance once the harvest payment (RF-24) exists, and no
// project status gates the settlement yet. Investor positions come from the captured investments (RF-10) unless the request
// sends them explicitly.
@Injectable()
export class SettlementUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly settlements: SettlementRepository,
    private readonly gateway: PaymentGateway,
    @Inject(PROJECT_WALLETS) private readonly wallets: ProjectWallets,
    @Optional() private readonly captured?: CapturedInvestors,
  ) {}

  private async project(id: string, viewer: Viewer): Promise<Project> {
    const project = await this.projects.findById(id);
    if (!project || !canView(project, viewer)) throw new NotFoundError(`Project ${id} not found`);
    return project;
  }

  private async settlement(id: string): Promise<Settlement> {
    const settlement = await this.settlements.findById(id);
    if (!settlement) throw new NotFoundError(`Settlement ${id} not found`);
    return settlement;
  }

  private async assertNoOtherActive(projectId: string, exceptId: string | null) {
    const active = (await this.settlements.findByProject(projectId)).find((s) => s.id !== exceptId && ACTIVE_STATUSES.includes(s.status));
    if (active) throw new DomainError(`Project ${projectId} already has settlement ${active.id} (${active.status})`);
  }

  private async terms(project: Project, request: SettlementRequest): Promise<SettlementTerms> {
    const investors = request.investors ?? (await this.captured?.forProject(project.id)) ?? [];
    if (investors.length === 0) throw new ValidationError({ investors: ["El proyecto no tiene inversiones captadas: agrega los inversionistas."] }, "No investors");
    return { ...request, investors, days: request.days ?? cycleDays(project) };
  }

  /** The cascade and its payouts for these terms; nothing is stored. */
  async preview(projectId: string, viewer: Viewer, request: SettlementRequest) {
    const project = await this.project(projectId, viewer);
    const terms = await this.terms(project, request);
    return { project, terms, preferredRateBps: PREFERRED_RATE_BPS, ...planPayouts(terms, this.wallets, project.currency) };
  }

  async create(projectId: string, viewer: Viewer, request: SettlementRequest): Promise<Settlement> {
    const project = await this.project(projectId, viewer);
    await this.assertNoOtherActive(project.id, null);
    const settlement = createSettlement({
      id: randomUUID(),
      projectId: project.id,
      terms: await this.terms(project, request),
      wallets: this.wallets,
      currency: project.currency,
      assetScale: project.assetScale,
      createdBy: viewer.id,
      now: new Date(),
    });
    await this.settlements.save(settlement);
    return settlement;
  }

  async approve(id: string, viewer: Viewer): Promise<Settlement> {
    const settlement = await this.settlement(id);
    await this.assertNoOtherActive(settlement.projectId, settlement.id);
    const approved = approveSettlement(settlement, viewer.id, new Date());
    await this.settlements.save(approved);
    return approved;
  }

  /**
   * Pays every pending payout through the PaymentGateway (one at a time, `${settlementId}:${payoutId}` idempotency), then
   * polls the ones in flight. A gateway failure fails only its payout; a refusal (DomainError) stops here with a 409 and
   * leaves that payout pending. Calling it again pays what is pending and syncs what is in flight.
   */
  async execute(id: string): Promise<Settlement> {
    let settlement = startExecution(await this.settlement(id));
    await this.settlements.save(settlement);
    await this.projects.updateStatus(settlement.projectId, PROJECT_STATUS.SETTLEMENT_PROCESSING);

    for (const payout of settlement.payouts.filter((p) => p.status === PAYOUT_STATUS.PENDING)) {
      const result: LineResult = await this.gateway
        .pay({
          milestoneId: settlement.id,
          lineId: payout.id,
          walletAddress: payout.walletAddress,
          amount: payout.amount,
          currency: settlement.currency,
          assetScale: settlement.assetScale,
          fixedDebitAmount: payout.fixedDebitAmount,
        })
        .catch((error: unknown) => {
          if (error instanceof DomainError) throw error;
          return { status: "fallido", reference: null };
        });
      settlement = applyPayoutResult(settlement, payout.id, result, new Date());
      await this.settlements.save(settlement);
    }

    for (const payout of settlement.payouts.filter((p) => p.status === PAYOUT_STATUS.EXECUTING && p.reference)) {
      // Unreachable gateway: the payout stays executing for the next call.
      const result = await this.gateway.check(payout.reference as string).catch(() => null);
      if (!result) continue;
      settlement = applyPayoutResult(settlement, payout.id, result, new Date());
      await this.settlements.save(settlement);
    }

    if (settlement.status === SETTLEMENT_STATUS.EXECUTED) await this.projects.updateStatus(settlement.projectId, PROJECT_STATUS.SETTLED_AND_CLOSED);
    return settlement;
  }

  /** The owner producer, investors, operator and fiduciaria read it; anyone else gets 404, so ids never leak. */
  async get(id: string, viewer: Viewer): Promise<Settlement> {
    const settlement = await this.settlements.findById(id);
    if (!settlement) throw new NotFoundError(`Settlement ${id} not found`);
    await this.project(settlement.projectId, viewer).catch(() => {
      throw new NotFoundError(`Settlement ${id} not found`);
    });
    return settlement;
  }
}
