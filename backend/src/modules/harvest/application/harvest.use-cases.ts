import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { DomainError, NotFoundError, ValidationError } from "../../../shared/domain-errors";
import type { Role } from "../../auth/ports/role";
import type { FundingCallback } from "../../milestones/ports/milestone-funding";
import { canView, minorToPesos, type Project, type Viewer } from "../../projects/application/project";
import {
  certifyHarvest,
  confirmReception,
  declareHarvest,
  type Harvest,
  HARVEST_STATUS,
  markPaid,
  nextProjectStatus,
  paymentRefusal,
  type PriceTerms,
} from "../domain/harvest";
import { HarvestPayment, type HarvestOrder } from "../ports/harvest-payment";
import { HarvestStore } from "../ports/harvest-store";
import { PurchaseContractPrice } from "../ports/purchase-contract-price";

export const HARVEST_CLOCK = Symbol("HARVEST_CLOCK");
export type Clock = { now(): Date };

export type DeclareRequest = { quantityKg: number; qualityGrade: string; evidence: string };
/** price: the request's terms, used only when the project has no purchase contract. */
export type CertifyRequest = { quantityKg: number; qualityGrade: string; notes: string | null; price: PriceTerms | null };

const PRODUCER_SIDE: readonly Role[] = ["seller", "admin"];
const VERIFIER_SIDE: readonly Role[] = ["verifier", "admin"];
const BUYER_SIDE: readonly Role[] = ["buyer", "admin"];
// Buyers and the verifier act on any project's harvest; the rest see what canView lets them see.
const SEES_EVERY_HARVEST: readonly Role[] = ["buyer", "verifier"];

const requireRole = (viewer: Viewer, roles: readonly Role[], message: string) => {
  if (!roles.includes(viewer.role)) throw new DomainError(message);
};

// PRD v3 RF-24 / Fase 3 pasos 1–3: declare → certify (Q, quality, P_g) → the buyer pays Q·P_g into custody → reception.
// Every write runs under the project row lock, so a replayed callback or a double click never books the credit twice.
@Injectable()
export class HarvestUseCases {
  constructor(
    private readonly store: HarvestStore,
    private readonly payment: HarvestPayment,
    @Inject(HARVEST_CLOCK) private readonly clock: Clock,
    @Optional() private readonly contracts?: PurchaseContractPrice,
  ) {}

  private async project(id: string, viewer: Viewer, store: HarvestStore = this.store): Promise<Project> {
    const project = await store.findProject(id);
    if (!project || !(canView(project, viewer) || SEES_EVERY_HARVEST.includes(viewer.role))) throw new NotFoundError(`Project ${id} not found`);
    return project;
  }

  private async harvest(projectId: string, store: HarvestStore = this.store): Promise<Harvest> {
    const harvest = await store.findHarvest(projectId);
    if (!harvest) throw new DomainError("La cosecha aún no se ha declarado.");
    return harvest;
  }

  private async commit(store: HarvestStore, harvest: Harvest): Promise<Harvest> {
    await store.saveHarvest(harvest);
    await store.setProjectStatus(harvest.projectId, nextProjectStatus(harvest));
    return harvest;
  }

  async get(projectId: string, viewer: Viewer): Promise<{ project: Project; harvest: Harvest | null }> {
    const project = await this.project(projectId, viewer);
    return { project, harvest: await this.store.findHarvest(projectId) };
  }

  /** The verifier's queue: every harvest with its project (declared ones wait for certification). */
  async listForReview(viewer: Viewer): Promise<{ project: Project; harvest: Harvest }[]> {
    requireRole(viewer, VERIFIER_SIDE, "Solo el verificador revisa las cosechas.");
    const rows = await Promise.all((await this.store.listHarvests()).map(async (harvest) => ({ project: await this.store.findProject(harvest.projectId), harvest })));
    return rows.filter((r): r is { project: Project; harvest: Harvest } => r.project !== null);
  }

  async declare(projectId: string, user: Viewer, input: DeclareRequest): Promise<Harvest> {
    requireRole(user, PRODUCER_SIDE, "Solo el productor del proyecto declara la cosecha.");
    return this.store.transaction(projectId, async (tx) => {
      const project = await this.project(projectId, user, tx);
      const harvest = declareHarvest(
        { projectId, currentStatus: project.currentStatus, currency: project.currency, assetScale: project.assetScale },
        await tx.findHarvest(projectId),
        { ...input, userId: user.id, now: this.clock.now() },
      );
      return this.commit(tx, harvest);
    });
  }

  async certify(projectId: string, user: Viewer, input: CertifyRequest): Promise<Harvest> {
    requireRole(user, VERIFIER_SIDE, "Solo el verificador certifica la cosecha.");
    const contract = (await this.contracts?.termsFor(projectId)) ?? null;
    const price = contract ? { source: "contract" as const, terms: contract } : input.price ? { source: "request" as const, terms: input.price } : null;
    if (!price) throw new ValidationError({ price: ["El proyecto no tiene contrato de compra: ingresa el precio por kilo."] }, "Harvest price missing");
    return this.store.transaction(projectId, async (tx) => {
      await this.project(projectId, user, tx);
      const harvest = certifyHarvest(await this.harvest(projectId, tx), {
        quantityKg: input.quantityKg,
        qualityGrade: input.qualityGrade,
        notes: input.notes,
        price,
        userId: user.id,
        now: this.clock.now(),
      });
      return this.commit(tx, harvest);
    });
  }

  private order(h: Harvest): HarvestOrder {
    if (h.amountDue === null) throw new DomainError("La cosecha aún no está certificada.");
    return { projectId: h.projectId, amount: h.amountDue, currency: h.currency, assetScale: h.assetScale };
  }

  /** The buyer pays Q·P_g into custody: at once when simulated, else after approving the grant at redirectUrl. */
  async pay(projectId: string, buyer: Viewer): Promise<{ harvest: Harvest; redirectUrl: string | null }> {
    requireRole(buyer, BUYER_SIDE, "Solo el comprador paga la cosecha.");
    await this.project(projectId, buyer);
    const harvest = await this.harvest(projectId);
    const refusal = paymentRefusal(harvest);
    if (refusal) throw new DomainError(refusal);
    const started = await this.payment.start(this.order(harvest));
    if (!started) return { harvest: await this.settle(projectId, buyer.id, null), redirectUrl: null };
    // The wallet callback carries no session: remember who is paying so the credit names them.
    const pending = { ...harvest, buyerUserId: buyer.id };
    await this.store.saveHarvest(pending);
    return { harvest: pending, redirectUrl: started.redirectUrl };
  }

  /** The buyer's wallet sent them back: verify, move the money, then book the custody credit. */
  async completePayment(projectId: string, callback: FundingCallback): Promise<Harvest> {
    const harvest = await this.harvest(projectId);
    if (harvest.status !== HARVEST_STATUS.CERTIFIED || !harvest.buyerUserId) throw new DomainError(`The harvest of ${projectId} has no payment waiting for the wallet`);
    const { reference } = await this.payment.complete(this.order(harvest), callback);
    return this.settle(projectId, harvest.buyerUserId, reference);
  }

  // Ledger CREDIT, custody balance and MARKET_PAYMENT_HELD commit together. Idempotent: a paid harvest is left as is.
  private settle(projectId: string, buyerUserId: string, reference: string | null): Promise<Harvest> {
    return this.store.transaction(projectId, async (tx) => {
      const current = await this.harvest(projectId, tx);
      if (current.status !== HARVEST_STATUS.CERTIFIED) return current;
      const now = this.clock.now();
      const paid = markPaid(current, buyerUserId, reference, now);
      const amount = this.order(paid).amount;
      await tx.creditHarvest(
        {
          id: `led-${randomUUID()}`,
          projectId,
          amount: minorToPesos(amount, paid.assetScale),
          currency: paid.currency,
          buyerUserId,
          paymentReference: reference,
          createdAt: now.toISOString(),
        },
        amount,
      );
      return this.commit(tx, paid);
    });
  }

  /** The paying buyer confirms they received the goods: DELIVERED_TO_BUYER, which opens the settlement (RF-26). */
  async confirmReception(projectId: string, buyer: Viewer): Promise<Harvest> {
    requireRole(buyer, BUYER_SIDE, "Solo el comprador confirma la recepción.");
    return this.store.transaction(projectId, async (tx) => {
      await this.project(projectId, buyer, tx);
      const harvest = await this.harvest(projectId, tx);
      // An operator may confirm on the buyer's behalf.
      const who = buyer.role === "admin" ? (harvest.buyerUserId ?? buyer.id) : buyer.id;
      return this.commit(tx, confirmReception(harvest, who, this.clock.now()));
    });
  }
}
