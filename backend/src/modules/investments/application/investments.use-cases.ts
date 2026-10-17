import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { DomainError, NotFoundError, RejectedError, ValidationError } from "../../../shared/domain-errors";
import { DomainEvents } from "../../../shared/events/domain-events";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import type { FundingCallback } from "../../milestones/ports/milestone-funding";
import { canView, minorToPesos, PROJECT_STATUS, type Project, type Viewer } from "../../projects/application/project";
import type { InvestorPosition } from "../../settlement/application/settlement";
import {
  canInvest,
  type CaptureQuote,
  type CaptureSummary,
  captureSummary,
  FUNDABLE_STATUSES,
  INVESTMENT_STATUS,
  type InvestRefusal,
  type Investment,
  NON_QUALIFIED_CAP_PCT,
  projectStatusAfterCapture,
  withQuote,
} from "../domain/investment";
import { InvestmentCapture } from "../ports/investment-capture";
import { InvestmentStore } from "../ports/investment-store";

export const INVESTMENT_CLOCK = Symbol("INVESTMENT_CLOCK");
export type Clock = { now(): Date };

/** An investment as POST left it: with the wallet consent URL while it waits for the investor (never stored). */
export type InvestmentOutcome = Investment & { consentRedirectUrl?: string };

/** amount in the project's minor units (COP); walletAddress is the investor's own wallet, already https-checked. */
export type InvestOrder = { amount: number; walletAddress: string };

const REFUSALS: Record<InvestRefusal, string> = {
  project_status: "Este proyecto ya no recibe inversiones.",
  amount: "El monto debe ser mayor a cero.",
  exceeds_remaining: "El monto supera lo que falta por captar en este proyecto.",
  investor_cap: `Un inversionista no calificado puede aportar como máximo el ${NON_QUALIFIED_CAP_PCT} % del proyecto.`,
  in_flight: "Ya tienes una inversión con aprobación pendiente en este proyecto. Apruébala en tu billetera o espera unos minutos.",
};
const NOT_PENDING = "Esta inversión ya no espera aprobación.";
const WALLET_UNREADABLE = "No pudimos leer esa billetera. Revisa la dirección.";
const WALLET_DOWN = "La billetera no respondió. Intenta de nuevo en unos minutos.";

const isStaff = (user: Viewer) => user.role === "admin" || user.role === "fidu";

// RF-10 / RF-29: the investor side of the capture. The money moves through InvestmentCapture (simulated or Open Payments);
// every custody effect (ledger credit, balance, project status) commits under the project row lock, like buyer deposits.
@Injectable()
export class InvestmentUseCases {
  constructor(
    private readonly store: InvestmentStore,
    private readonly gateway: InvestmentCapture,
    @Inject(INVESTMENT_CLOCK) private readonly clock: Clock,
    // RF-37: the capture that reaches the target activates the project; its producer is told.
    @Optional() private readonly events?: DomainEvents,
  ) {}

  private async project(id: string, viewer: Viewer, store: InvestmentStore = this.store): Promise<Project> {
    const project = await store.findProject(id);
    if (!project || !canView(project, viewer)) throw new NotFoundError(`Project ${id} not found`);
    return project;
  }

  /** The owner producer and staff see every investment of the project; an investor only their own. */
  private sees(project: Project, viewer: Viewer, investment: Investment) {
    return isStaff(viewer) || (viewer.role === "seller" && project.ownerUserId === viewer.id) || investment.investorUserId === viewer.id;
  }

  async invest(projectId: string, investor: AuthenticatedUser, order: InvestOrder): Promise<InvestmentOutcome> {
    if (investor.role !== "investor") throw new RejectedError("Solo un inversionista puede invertir en un proyecto.");
    await this.project(projectId, investor);
    const wallet = await this.gateway.wallet(order.walletAddress).catch(() => {
      throw new ValidationError({ wallet_address: [WALLET_UNREADABLE] }, "Unreadable wallet address");
    });

    // The rules run under the project lock, so two subscriptions never both fit into the same remaining amount.
    const reserved = await this.store.transaction(projectId, async (tx) => {
      const project = await this.project(projectId, investor, tx);
      const now = this.clock.now();
      const refusal = canInvest({ project, investments: await tx.listByProject(projectId), investorUserId: investor.id, amount: order.amount, now });
      if (refusal) throw new RejectedError(REFUSALS[refusal]);
      const investment: Investment = {
        id: randomUUID(),
        projectId,
        investorUserId: investor.id,
        walletAddress: wallet.id,
        status: INVESTMENT_STATUS.PENDING_CONSENT,
        failureReason: null,
        amount: order.amount,
        currency: project.currency,
        assetScale: project.assetScale,
        quote: null,
        impliedRate: null,
        incomingPaymentId: null,
        outgoingPaymentId: null,
        createdAt: now,
        capturedAt: null,
      };
      await tx.save(investment);
      return investment;
    });

    let started: Awaited<ReturnType<InvestmentCapture["start"]>>;
    try {
      started = await this.gateway.start(reserved, wallet);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.store.save({ ...reserved, status: INVESTMENT_STATUS.FAILED, failureReason: reason });
      throw error instanceof DomainError ? error : new RejectedError(WALLET_DOWN);
    }
    const quoted = { ...withQuote(reserved, started.quote), incomingPaymentId: started.incomingPaymentId };
    if (started.kind === "captured") return this.settle(quoted, started.quote, started.outgoingPaymentId);
    await this.store.save(quoted);
    return { ...quoted, consentRedirectUrl: started.redirectUrl };
  }

  /** The investor's wallet sent them back: verify, move the money, then apply the custody effects. */
  async completeConsent(id: string, callback: FundingCallback): Promise<Investment> {
    const investment = await this.store.findById(id);
    if (!investment) throw new NotFoundError(`Investment ${id} not found`);
    if (investment.status !== INVESTMENT_STATUS.PENDING_CONSENT) throw new RejectedError(NOT_PENDING);
    const completion = await this.gateway.complete(investment, callback);
    if (completion.kind === "captured") return this.settle(investment, completion.quote, completion.outgoingPaymentId);
    const failed = { ...withQuote(investment, completion.quote), status: INVESTMENT_STATUS.FAILED, failureReason: completion.reason };
    await this.store.save(failed);
    return failed;
  }

  // CAPTURED, the INVESTOR_CAPITAL credit and custody balance + status commit together. Idempotent: a settled one is left as is.
  private async settle(found: Investment, quote: CaptureQuote, outgoingPaymentId: string): Promise<Investment> {
    let activated = false;
    const settled = await this.store.transaction(found.projectId, async (tx) => {
      const current = await tx.findById(found.id);
      if (current && current.status !== INVESTMENT_STATUS.PENDING_CONSENT) return current;
      const project = await tx.findProject(found.projectId);
      if (!project) throw new NotFoundError(`Project ${found.projectId} not found`);
      const now = this.clock.now();
      const captured: Investment = { ...withQuote(found, quote), status: INVESTMENT_STATUS.CAPTURED, outgoingPaymentId, capturedAt: now };
      await tx.save(captured);
      const status = projectStatusAfterCapture(project.currentStatus, project.custodyBalance + captured.amount, project.targetAmount);
      activated = status === PROJECT_STATUS.FUNDED_IN_CUSTODY && project.currentStatus !== PROJECT_STATUS.FUNDED_IN_CUSTODY;
      await tx.creditCapital(
        {
          id: `led-${randomUUID()}`,
          projectId: project.id,
          investmentId: captured.id,
          amount: minorToPesos(captured.amount, captured.assetScale),
          currency: captured.currency,
          paymentReference: outgoingPaymentId,
          createdAt: now.toISOString(),
        },
        captured.amount,
        status,
      );
      return captured;
    });
    if (activated) this.events?.publish({ type: "project.funded", projectId: found.projectId });
    return settled;
  }

  /** Where the wallet callback sends the browser back to; null for an unknown investment. */
  async projectOf(id: string): Promise<string | null> {
    return (await this.store.findById(id))?.projectId ?? null;
  }

  async listForProject(projectId: string, viewer: Viewer): Promise<Investment[]> {
    const project = await this.project(projectId, viewer);
    return (await this.store.listByProject(projectId)).filter((i) => this.sees(project, viewer, i));
  }

  async get(id: string, viewer: Viewer): Promise<Investment> {
    const investment = await this.store.findById(id);
    const project = investment ? await this.store.findProject(investment.projectId) : null;
    if (!investment || !project || !canView(project, viewer) || !this.sees(project, viewer, investment)) throw new NotFoundError(`Investment ${id} not found`);
    return investment;
  }

  async capture(projectId: string, viewer: Viewer): Promise<CaptureSummary & { currency: string; assetScale: number }> {
    const project = await this.project(projectId, viewer);
    return { ...captureSummary(project, await this.store.listByProject(projectId)), currency: project.currency, assetScale: project.assetScale };
  }

  /** The investor catalog: projects still raising, oldest first, with their capture bar. */
  async fundable(viewer: Viewer): Promise<{ project: Project; summary: CaptureSummary }[]> {
    const projects = (await this.store.listProjects()).filter((p) => FUNDABLE_STATUSES.includes(p.currentStatus) && canView(p, viewer));
    return Promise.all(projects.map(async (project) => ({ project, summary: captureSummary(project, await this.store.listByProject(project.id)) })));
  }

  /** The investor's project page: the project and its capture bar, whatever its status. */
  async projectWithCapture(projectId: string, viewer: Viewer): Promise<{ project: Project; summary: CaptureSummary }> {
    const project = await this.project(projectId, viewer);
    return { project, summary: captureSummary(project, await this.store.listByProject(projectId)) };
  }

  /** Every investment id of the investor in the project, whatever its status (settlement privacy, RF-26). */
  async investmentIdsOf(projectId: string, investorUserId: string): Promise<string[]> {
    return (await this.store.listByProject(projectId)).filter((i) => i.investorUserId === investorUserId).map((i) => i.id);
  }

  /**
   * RF-26 capital tier: one position per CAPTURED investment (its id), with the COP that reached custody, the wallet's
   * currency (anything but COP is paid with a fixed COP debit) and the wallet it came from.
   */
  async capturedPositions(projectId: string): Promise<InvestorPosition[]> {
    return (await this.store.listByProject(projectId))
      .filter((i) => i.status === INVESTMENT_STATUS.CAPTURED)
      .map((i) => ({ id: i.id, capital: i.amount, currency: i.quote?.debitAssetCode ?? i.currency, walletAddress: i.walletAddress }));
  }
}
