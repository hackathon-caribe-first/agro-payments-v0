import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { addFieldError, DomainError, type FieldErrors, NotFoundError, RejectedError, ValidationError } from "../../../shared/domain-errors";
import { UserDirectory } from "../../auth/ports/user-directory";
import { mergeReceipt, type LineResult } from "../../milestones/application/milestone";
import type { FundingCallback } from "../../milestones/ports/milestone-funding";
import { MilestoneRepository } from "../../milestones/ports/milestone.repository";
import { PaymentGateway } from "../../milestones/ports/payment-gateway";
import { WalletDirectory } from "../../payouts/ports/wallet-directory";
import { canView, PROJECT_STATUS, type Project, type ProjectStatus, type Viewer } from "../../projects/application/project";
import { ProjectRepository } from "../../projects/ports/project.repository";
import { SimulationRunRepository } from "../../simulation/ports/simulation-run.repository";
import { ContractsStore } from "../ports/contracts-store";
import { IndemnityInflow } from "../ports/indemnity-inflow";
import { PremiumFunding } from "../ports/premium-funding";
import { buildContractDocument, type ContractDocument, fullySigned, signContract } from "./contract-document";
import {
  BENEFICIARY,
  CLAIM_STATUS,
  type ClaimTrigger,
  indemnity,
  type InsuranceClaim,
  type InsurancePolicy,
  netPremium,
  POLICY_SOURCE,
  PREMIUM_STATUS,
  premiumLocked,
  premiumPaid,
  type PolicyTerms,
  termsFromSimulation,
  toWholePesos,
} from "./insurance";
import { type ContractCurrency, type ContractUnit, PURCHASE_CONTRACT_EDITABLE, type PurchaseContract, type PurchasePrice } from "./purchase-contract";

export type PurchaseContractInput = {
  price: PurchasePrice;
  quantity: number;
  unit: ContractUnit;
  currency: ContractCurrency;
  buyerEmail: string;
  buyerWalletAddress: string;
};

/** Money in minor units. The premium and insured terms may be null when the project has a simulation (its figures win). */
export type PolicyInput = {
  insurerName: string;
  insurerWalletAddress: string;
  grossPremium: number | null;
  subsidyPct: number;
  thresholdPct: number;
  deductiblePct: number;
  hectares: number | null;
  expectedYieldKgPerHa: number | null;
  insuredPricePerKg: number | null;
  indexTrigger: number | null;
  indexExit: number | null;
};

export type ClaimInput = { trigger: ClaimTrigger; observedValue: number; evidence: string };
export type SignatureMeta = { ip: string | null; userAgent: string | null };

/**
 * RF-14 «al activar»: Fase 1 pays the premium once the capture is complete (request #13, «Captación completa»), i.e. from
 * FUNDED_IN_CUSTODY on; IN_EXECUTION still allows it so a project activated before this existed can pay. Later is too late.
 */
export const PREMIUM_PAYABLE: readonly ProjectStatus[] = [PROJECT_STATUS.FUNDED_IN_CUSTODY, PROJECT_STATUS.IN_EXECUTION];
const CLOSED: readonly ProjectStatus[] = [PROJECT_STATUS.SETTLEMENT_PROCESSING, PROJECT_STATUS.SETTLED_AND_CLOSED, PROJECT_STATUS.CANCELLED_OR_DISPUTED];
const CLAIM_CLOSED = "El proyecto ya está en liquidación o cerrado: no admite reclamaciones a la póliza.";
const WALLET_ERROR = "No pudimos validar esa wallet: revisa la dirección.";

type Clock = { now: () => Date };

// RF-04, RF-05, RF-09, RF-14, RF-25: the project's contracts and its ISA policy. Money leaves custody only through the
// PaymentGateway under the fiduciaria's premium grant; every custody effect is booked by the store under the project lock.
@Injectable()
export class ContractsUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly milestones: MilestoneRepository,
    private readonly store: ContractsStore,
    private readonly runs: SimulationRunRepository,
    private readonly users: UserDirectory,
    private readonly wallets: WalletDirectory,
    private readonly gateway: PaymentGateway,
    private readonly premium: PremiumFunding,
    private readonly inflow: IndemnityInflow,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  private async project(id: string, viewer: Viewer): Promise<Project> {
    const project = await this.projects.findById(id);
    if (!project || !canView(project, viewer)) throw new NotFoundError(`Project ${id} not found`);
    return project;
  }

  /** Staff, investors and the owner see the project; the contract's buyer also reads its contracts. */
  private async readable(id: string, viewer: Viewer): Promise<Project> {
    const project = await this.projects.findById(id);
    if (!project) throw new NotFoundError(`Project ${id} not found`);
    if (canView(project, viewer)) return project;
    const purchase = await this.store.findPurchaseContract(id);
    if (purchase?.buyerUserId === viewer.id) return project;
    throw new NotFoundError(`Project ${id} not found`);
  }

  private async walletAsset(errors: FieldErrors, field: string, walletAddress: string) {
    const wallet = await this.wallets.lookup(walletAddress);
    if (!wallet) addFieldError(errors, field, WALLET_ERROR);
    return wallet;
  }

  // ---- RF-04 purchase contract ----

  async hasPurchaseContract(projectId: string) {
    return (await this.store.findPurchaseContract(projectId)) !== null;
  }

  async getPurchaseContract(projectId: string, viewer: Viewer): Promise<PurchaseContract> {
    await this.readable(projectId, viewer);
    const contract = await this.store.findPurchaseContract(projectId);
    if (!contract) throw new NotFoundError(`Project ${projectId} has no purchase contract`);
    return contract;
  }

  async putPurchaseContract(projectId: string, viewer: Viewer, input: PurchaseContractInput): Promise<PurchaseContract> {
    const project = await this.project(projectId, viewer);
    if (!PURCHASE_CONTRACT_EDITABLE.includes(project.currentStatus)) throw new RejectedError("El contrato de compra se fija antes de publicar el proyecto.");
    const errors: FieldErrors = {};
    // PRD: the buyer may be an investor too.
    const buyer = await this.users.findByEmail(input.buyerEmail);
    if (!buyer || (buyer.role !== "buyer" && buyer.role !== "investor")) addFieldError(errors, "buyer_email", "No encontramos un comprador registrado con ese correo.");
    const wallet = await this.walletAsset(errors, "buyer_wallet_address", input.buyerWalletAddress);
    if (!buyer || !wallet || Object.keys(errors).length > 0) throw new ValidationError(errors, "Invalid purchase contract");
    const contract: PurchaseContract = {
      projectId: project.id,
      price: input.price,
      quantity: input.quantity,
      unit: input.unit,
      currency: input.currency,
      buyerUserId: buyer.id,
      buyerWalletAddress: input.buyerWalletAddress,
      buyerWalletAssetCode: wallet.assetCode,
      buyerWalletAssetScale: wallet.assetScale,
      updatedBy: viewer.id,
      updatedAt: this.clock.now(),
    };
    await this.store.savePurchaseContract(contract);
    return contract;
  }

  // ---- RF-05 insurance policy ----

  async getPolicy(projectId: string, viewer: Viewer): Promise<InsurancePolicy> {
    await this.readable(projectId, viewer);
    const policy = await this.store.findPolicy(projectId);
    if (!policy) throw new NotFoundError(`Project ${projectId} has no insurance policy`);
    return policy;
  }

  async putPolicy(projectId: string, viewer: Viewer, input: PolicyInput): Promise<InsurancePolicy> {
    const project = await this.project(projectId, viewer);
    const current = await this.store.findPolicy(project.id);
    if (current && premiumLocked(current)) throw new RejectedError("La prima ya se pagó desde la custodia: la póliza no se puede cambiar.");
    const errors: FieldErrors = {};
    await this.walletAsset(errors, "insurer_wallet_address", input.insurerWalletAddress);
    const run = await this.runs.findLatest(project.id);
    const index = { indexTrigger: input.indexTrigger, indexExit: input.indexExit };
    let terms: PolicyTerms | null = null;
    if (run) {
      terms = { ...termsFromSimulation(run.inputs, run.sheet), ...index };
    } else {
      const { grossPremium, hectares, expectedYieldKgPerHa, insuredPricePerKg } = input;
      if (grossPremium === null) addFieldError(errors, "premium", "Ingresa la prima o simula el proyecto.");
      if (hectares === null) addFieldError(errors, "hectares", "Ingresa las hectáreas aseguradas o simula el proyecto.");
      if (expectedYieldKgPerHa === null) addFieldError(errors, "expected_yield_kg_per_ha", "Ingresa el rendimiento esperado o simula el proyecto.");
      if (insuredPricePerKg === null) addFieldError(errors, "insured_price_per_kg", "Ingresa el precio asegurado o simula el proyecto.");
      if (grossPremium !== null && hectares !== null && expectedYieldKgPerHa !== null && insuredPricePerKg !== null) {
        terms = {
          hectares,
          expectedYieldKgPerHa,
          // ponytail: no shrinkage input without a simulation; λ = 0 overstates the guaranteed value by λ at most.
          shrinkagePct: 0,
          insuredPricePerKg,
          thresholdPct: input.thresholdPct,
          deductiblePct: input.deductiblePct,
          grossPremium: toWholePesos(grossPremium),
          subsidyPct: input.subsidyPct,
          netPremium: netPremium(grossPremium, input.subsidyPct),
          ...index,
        };
      }
    }
    if (!terms || Object.keys(errors).length > 0) throw new ValidationError(errors, "Invalid insurance policy");
    const policy: InsurancePolicy = {
      projectId: project.id,
      insurerName: input.insurerName,
      insurerWalletAddress: input.insurerWalletAddress,
      beneficiary: BENEFICIARY,
      source: run ? POLICY_SOURCE.SIMULATION : POLICY_SOURCE.INPUT,
      simulationRunId: run?.id ?? null,
      terms,
      // A failed attempt stays visible until the next one.
      premiumPayment: current?.premiumPayment ?? null,
      updatedBy: viewer.id,
      updatedAt: this.clock.now(),
    };
    await this.store.savePolicy(policy);
    return policy;
  }

  // ---- RF-14 premium from custody ----

  private async policyFor(project: Project): Promise<InsurancePolicy> {
    const policy = await this.store.findPolicy(project.id);
    if (!policy) throw new RejectedError("Registra la póliza antes de pagar la prima.");
    return policy;
  }

  /** The fiduciaria approves the premium grant on custody (net premium cap); null in simulated mode (nothing to approve). */
  async startPremiumGrant(projectId: string, viewer: Viewer): Promise<{ redirectUrl: string } | null> {
    const project = await this.project(projectId, viewer);
    const policy = await this.policyFor(project);
    if (premiumLocked(policy)) throw new RejectedError("La prima ya se pagó o está en curso.");
    if (!this.premium.interactive) return null;
    if (await this.premium.ready(project.id)) throw new RejectedError("El grant de la prima ya está aprobado: paga la prima.");
    return this.premium.start({ projectId: project.id, amount: policy.terms.netPremium, currency: project.currency, assetScale: project.assetScale });
  }

  /** Unauthenticated wallet callback: only the pending grant's nonce plus a matching GNAP hash finalize it. */
  async completePremiumGrant(projectId: string, params: FundingCallback): Promise<void> {
    if (!(await this.projects.findById(projectId))) throw new NotFoundError(`Project ${projectId} not found`);
    await this.premium.complete(projectId, params);
  }

  /**
   * Pays the net premium to the insurer (simulated mode completes in this call), or syncs a payment in flight. Paid once: a
   * completed premium answers as is. The ledger DEBIT and the custody balance move only when the payment completed.
   */
  async payPremium(projectId: string, viewer: Viewer): Promise<InsurancePolicy> {
    const project = await this.project(projectId, viewer);
    let policy = await this.policyFor(project);
    if (premiumPaid(policy)) return policy;
    const inFlight = policy.premiumPayment?.status === PREMIUM_STATUS.EXECUTING && policy.premiumPayment.reference;
    if (!inFlight) {
      if (!PREMIUM_PAYABLE.includes(project.currentStatus)) throw new RejectedError("La prima se paga desde la custodia al activar el proyecto: completa la captación primero.");
      const amount = policy.terms.netPremium;
      if (project.custodyBalance < amount) throw new RejectedError("La custodia no tiene saldo para pagar la prima.");
      if (!(await this.premium.ready(project.id))) throw new RejectedError("La fiduciaria debe aprobar el grant de la prima sobre la custodia antes de pagarla.");
      const id = randomUUID();
      const result: LineResult = await this.gateway
        .pay({ milestoneId: project.id, lineId: id, walletAddress: policy.insurerWalletAddress, amount, currency: project.currency, assetScale: project.assetScale, grantScope: "premium" })
        .catch((error: unknown) => {
          if (error instanceof DomainError) throw error;
          return { status: "fallido", reference: null };
        });
      const payment = { id, amount, status: PREMIUM_STATUS.EXECUTING, reference: null, receipt: null, requestedBy: viewer.id, requestedAt: this.clock.now(), completedAt: null };
      policy = await this.apply(project, { ...policy, premiumPayment: payment }, result);
      if (policy.premiumPayment?.status !== PREMIUM_STATUS.EXECUTING) return policy;
    }
    // Simulated mode settles on the first check; open-payments mode may stay executing until a later call.
    const reference = policy.premiumPayment?.reference as string;
    const checked = await this.gateway.check(reference).catch(() => null);
    return checked ? this.apply(project, policy, checked) : policy;
  }

  private async apply(project: Project, policy: InsurancePolicy, result: LineResult): Promise<InsurancePolicy> {
    const payment = policy.premiumPayment;
    if (!payment) return policy;
    const receipt = mergeReceipt(payment.receipt, result.receipt);
    const reference = result.reference ?? payment.reference;
    if (result.status === "completado") {
      const now = this.clock.now();
      const paid = { ...policy, premiumPayment: { ...payment, status: PREMIUM_STATUS.COMPLETED, reference, receipt, completedAt: now } };
      await this.store.bookPremium(paid, { id: payment.id, projectId: project.id, amount: payment.amount, currency: project.currency, assetScale: project.assetScale, reference, at: now });
      // Like RF-22: the grant closes with its only payment. A failed revoke never undoes the payment.
      await this.premium.revoke(project.id).catch(() => undefined);
      return paid;
    }
    const status = result.status === "fallido" ? PREMIUM_STATUS.FAILED : PREMIUM_STATUS.EXECUTING;
    const next = { ...policy, premiumPayment: { ...payment, status, reference, receipt } };
    await this.store.savePolicy(next);
    return next;
  }

  // ---- RF-09 tri/quad-party contract ----

  async generateContract(projectId: string, viewer: Viewer): Promise<ContractDocument> {
    const project = await this.project(projectId, viewer);
    if (CLOSED.includes(project.currentStatus)) throw new RejectedError("El proyecto ya está en liquidación o cerrado.");
    const purchase = await this.store.findPurchaseContract(project.id);
    if (!purchase) throw new RejectedError("Registra el contrato de compra antes de generar el contrato.");
    const name = async (id: string, fallback: string) => (await this.users.findById(id))?.name || fallback;
    const investors = await Promise.all(
      (await this.store.capturedInvestors(project.id)).map(async (i) => ({ ...i, name: await name(i.userId, "Inversionista") })),
    );
    const context = {
      project,
      milestones: await this.milestones.findByProject(project.id),
      purchase,
      policy: await this.store.findPolicy(project.id),
      producerName: await name(project.ownerUserId, "Productor"),
      buyerName: await name(purchase.buyerUserId, "Comprador"),
      investors,
    };
    const latest = await this.store.latestDocument(project.id);
    const doc = buildContractDocument({ id: randomUUID(), version: (latest?.version ?? 0) + 1, context, createdBy: viewer.id, now: this.clock.now() });
    if (latest?.hash === doc.hash) return latest;
    await this.store.insertDocument(doc);
    return doc;
  }

  async getContract(projectId: string, viewer: Viewer): Promise<ContractDocument> {
    const doc = await this.store.latestDocument(projectId);
    const isParty = doc?.parties.some((p) => p.userId === viewer.id) ?? false;
    if (!isParty) await this.readable(projectId, viewer);
    if (!doc) throw new NotFoundError(`Project ${projectId} has no contract`);
    return doc;
  }

  /**
   * The viewer signs every party they are on the latest version. When the last party signs, a DRAFT project becomes
   * CONTRACT_SIGNED; a project already past it (capture open, funded, executing) keeps its status: the order never regresses.
   */
  async sign(contractId: string, viewer: Viewer, meta: SignatureMeta): Promise<ContractDocument> {
    const doc = await this.store.findDocument(contractId);
    if (!doc) throw new NotFoundError(`Contract ${contractId} not found`);
    const latest = await this.store.latestDocument(doc.projectId);
    if (latest?.id !== doc.id) throw new RejectedError("Hay una versión más reciente del contrato: firma esa.");
    const signed = signContract(doc, viewer, meta, this.clock.now());
    await this.store.addSignatures(doc.id, signed.signatures.slice(doc.signatures.length));
    if (fullySigned(signed)) {
      const project = await this.projects.findById(doc.projectId);
      if (project?.currentStatus === PROJECT_STATUS.DRAFT) await this.projects.updateStatus(project.id, PROJECT_STATUS.CONTRACT_SIGNED);
    }
    return signed;
  }

  // ---- RF-25 indemnity into custody ----

  async listClaims(projectId: string, viewer: Viewer): Promise<InsuranceClaim[]> {
    await this.readable(projectId, viewer);
    return this.store.listClaims(projectId);
  }

  async fileClaim(projectId: string, viewer: Viewer, input: ClaimInput): Promise<InsuranceClaim> {
    const project = await this.project(projectId, viewer);
    if (CLOSED.includes(project.currentStatus)) throw new RejectedError(CLAIM_CLOSED);
    const policy = await this.store.findPolicy(project.id);
    if (!policy || !premiumPaid(policy)) throw new RejectedError("La póliza no está vigente: la prima se paga desde la custodia antes de reclamar.");
    // ponytail: one indemnity per policy (one cycle); a partial second claim needs the insurer's adjustment flow.
    if ((await this.store.listClaims(project.id)).length > 0) throw new RejectedError("El proyecto ya tiene una reclamación de esta póliza.");
    const amount = indemnity(policy.terms, input);
    const id = randomUUID();
    const incomingPaymentUrl = await this.inflow.request({ claimId: id, projectId: project.id, amount, currency: project.currency, assetScale: project.assetScale });
    const claim: InsuranceClaim = {
      id,
      projectId: project.id,
      trigger: input.trigger,
      observedValue: input.observedValue,
      evidence: input.evidence,
      amount,
      status: CLAIM_STATUS.PENDING,
      incomingPaymentUrl,
      createdBy: viewer.id,
      createdAt: this.clock.now(),
      confirmedBy: null,
      confirmedAt: null,
    };
    await this.store.saveClaim(claim);
    return claim;
  }

  /** Books the indemnity into custody: at once in simulated mode, once the incoming payment received it in open-payments mode. */
  async confirmClaim(projectId: string, claimId: string, viewer: Viewer): Promise<InsuranceClaim> {
    const project = await this.project(projectId, viewer);
    const claim = await this.store.findClaim(claimId);
    if (!claim || claim.projectId !== project.id) throw new NotFoundError(`Claim ${claimId} not found`);
    if (claim.status === CLAIM_STATUS.CONFIRMED) return claim;
    if (CLOSED.includes(project.currentStatus)) throw new RejectedError(CLAIM_CLOSED);
    if (claim.incomingPaymentUrl) {
      const received = await this.inflow.received(claim.incomingPaymentUrl);
      if (received < claim.amount) {
        const pesos = (minor: number) => `$ ${(minor / 100).toLocaleString("es-CO")}`;
        throw new RejectedError(`La aseguradora aún no paga la indemnización: la custodia recibió ${pesos(received)} de ${pesos(claim.amount)}.`);
      }
    }
    const now = this.clock.now();
    const confirmed = { ...claim, status: CLAIM_STATUS.CONFIRMED, confirmedBy: viewer.id, confirmedAt: now };
    await this.store.bookIndemnity(confirmed, {
      id: claim.id,
      projectId: project.id,
      amount: claim.amount,
      currency: project.currency,
      assetScale: project.assetScale,
      reference: claim.incomingPaymentUrl,
      at: now,
    });
    return confirmed;
  }
}
