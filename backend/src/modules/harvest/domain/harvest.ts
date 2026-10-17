// PRD v3 RF-24 / Fase 3: the harvest of a project. The producer declares it, the verifier certifies quantity Q and quality, the
// contract formula prices it (A5), the buyer pays Q·P_g into custody and confirms reception. Pure functions: no Nest, no I/O.
// Prices are whole pesos per kg and Q whole kg, so the amount due is exact; it is stored in the project's minor units.
import { DomainError } from "../../../shared/domain-errors";
import { PROJECT_STATUS, type ProjectStatus } from "../../projects/application/project";

export const HARVEST_STATUS = { DECLARED: "DECLARED", CERTIFIED: "CERTIFIED", PAID: "PAID", RECEIVED: "RECEIVED" } as const;
export type HarvestStatus = (typeof HARVEST_STATUS)[keyof typeof HARVEST_STATUS];

/** A5: the contract price, fixed or a discount on the spot bounded by a floor and a ceiling. Whole pesos per kg; bps of 10.000. */
export type PriceTerms =
  | { kind: "fixed"; pricePerKg: number }
  | { kind: "formula"; spotPerKg: number; floorPerKg: number; ceilingPerKg: number; discountBps: number };

/** Where the terms came from: the purchase contract (RF-09) or, without one, the certification request. */
export type PriceSource = "contract" | "request";

export interface HarvestPrice {
  source: PriceSource;
  terms: PriceTerms;
  /** P_g, whole pesos per kg. */
  pricePerKg: number;
  /** e_g as an exact "n/d": 1/1 for a COP contract (TRM_d/TRM_0 for USD contracts, not supported yet). */
  exchangeFactor: string;
}

export interface Harvest {
  projectId: string;
  status: HarvestStatus;
  declaredQuantityKg: number;
  declaredQuality: string;
  evidence: string;
  declaredBy: string;
  declaredAt: Date;
  certifiedQuantityKg: number | null;
  certifiedQuality: string | null;
  certificationNotes: string | null;
  certifiedBy: string | null;
  certifiedAt: Date | null;
  price: HarvestPrice | null;
  /** Q·P_g·e_g in minor units of currency/assetScale; null until certified. */
  amountDue: number | null;
  currency: string;
  assetScale: number;
  /** Better Auth id of the buyer who paid; only they confirm reception. */
  buyerUserId: string | null;
  paymentReference: string | null;
  paidAt: Date | null;
  receivedAt: Date | null;
}

type ProjectRef = { projectId: string; currentStatus: ProjectStatus; currency: string; assetScale: number };

// The milestones run with custody funded; the harvest follows them.
// ponytail: it does not require every milestone to be closed; the verifier's certification is the gate that matters.
const DECLARABLE: readonly ProjectStatus[] = [PROJECT_STATUS.FUNDED_IN_CUSTODY, PROJECT_STATUS.IN_EXECUTION];

const isWhole = (v: number, min = 0) => Number.isSafeInteger(v) && v >= min;

/** P_g in whole pesos per kg; (1 − d_off)·spot rounds half up to the whole peso. */
export function effectivePricePerKg(terms: PriceTerms): number {
  if (terms.kind === "fixed") {
    if (!isWhole(terms.pricePerKg, 1)) throw new DomainError("A fixed price must be a positive whole peso amount per kg");
    return terms.pricePerKg;
  }
  const { spotPerKg, floorPerKg, ceilingPerKg, discountBps } = terms;
  if (![spotPerKg, floorPerKg, ceilingPerKg].every((v) => isWhole(v)) || !isWhole(discountBps) || discountBps > 10_000) {
    throw new DomainError("Formula prices must be whole pesos and the discount between 0 and 10.000 bps");
  }
  if (floorPerKg > ceilingPerKg) throw new DomainError("The price floor cannot exceed the ceiling");
  const discounted = Number((BigInt(spotPerKg) * BigInt(10_000 - discountBps) + 5_000n) / 10_000n);
  const price = Math.max(floorPerKg, Math.min(ceilingPerKg, discounted));
  if (price <= 0) throw new DomainError("The harvest price must be above zero");
  return price;
}

/** Q·P_g in minor units (e_g = 1 in COP). */
export function amountDue(quantityKg: number, pricePerKg: number, assetScale: number): number {
  const minor = BigInt(quantityKg) * BigInt(pricePerKg) * 10n ** BigInt(assetScale);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new DomainError("The harvest amount is too large");
  return Number(minor);
}

type DeclareInput = { quantityKg: number; qualityGrade: string; evidence: string; userId: string; now: Date };

export function declareHarvest(project: ProjectRef, existing: Harvest | null, input: DeclareInput): Harvest {
  if (existing) throw new DomainError(`Project ${project.projectId} already declared its harvest`);
  if (!DECLARABLE.includes(project.currentStatus)) throw new DomainError(`Project ${project.projectId} is ${project.currentStatus}; the harvest follows the funded milestones`);
  return {
    projectId: project.projectId,
    status: HARVEST_STATUS.DECLARED,
    declaredQuantityKg: input.quantityKg,
    declaredQuality: input.qualityGrade,
    evidence: input.evidence,
    declaredBy: input.userId,
    declaredAt: input.now,
    certifiedQuantityKg: null,
    certifiedQuality: null,
    certificationNotes: null,
    certifiedBy: null,
    certifiedAt: null,
    price: null,
    amountDue: null,
    currency: project.currency,
    assetScale: project.assetScale,
    buyerUserId: null,
    paymentReference: null,
    paidAt: null,
    receivedAt: null,
  };
}

type CertifyInput = {
  quantityKg: number;
  qualityGrade: string;
  notes: string | null;
  price: { source: PriceSource; terms: PriceTerms };
  userId: string;
  now: Date;
};

export function certifyHarvest(h: Harvest, input: CertifyInput): Harvest {
  if (h.status !== HARVEST_STATUS.DECLARED) throw new DomainError(`The harvest of ${h.projectId} is ${h.status}; only a declared harvest is certified`);
  // ponytail: COP contracts only (e_g = 1); a USD contract needs TRM_d / TRM_0 from the buyer's quote.
  if (h.currency !== "COP") throw new DomainError(`Harvest pricing supports COP contracts only, not ${h.currency}`);
  const pricePerKg = effectivePricePerKg(input.price.terms);
  return {
    ...h,
    status: HARVEST_STATUS.CERTIFIED,
    certifiedQuantityKg: input.quantityKg,
    certifiedQuality: input.qualityGrade,
    certificationNotes: input.notes,
    certifiedBy: input.userId,
    certifiedAt: input.now,
    price: { ...input.price, pricePerKg, exchangeFactor: "1/1" },
    amountDue: amountDue(input.quantityKg, pricePerKg, h.assetScale),
  };
}

/** Why the buyer cannot pay now, or null. */
export const paymentRefusal = (h: Harvest | null): string | null =>
  !h ? "La cosecha aún no se ha declarado." : h.status === HARVEST_STATUS.CERTIFIED ? null : h.status === HARVEST_STATUS.DECLARED ? "La cosecha aún no está certificada." : "La cosecha ya está pagada.";

export function markPaid(h: Harvest, buyerUserId: string, reference: string | null, now: Date): Harvest {
  const refusal = paymentRefusal(h);
  if (refusal) throw new DomainError(refusal);
  return { ...h, status: HARVEST_STATUS.PAID, buyerUserId, paymentReference: reference, paidAt: now };
}

export function confirmReception(h: Harvest, buyerUserId: string, now: Date): Harvest {
  if (h.status !== HARVEST_STATUS.PAID) throw new DomainError("La recepción se confirma después del pago a la custodia.");
  if (h.buyerUserId !== buyerUserId) throw new DomainError("Solo el comprador que pagó la cosecha confirma la recepción.");
  return { ...h, status: HARVEST_STATUS.RECEIVED, receivedAt: now };
}

const PROJECT_STATUS_OF: Record<HarvestStatus, ProjectStatus> = {
  DECLARED: PROJECT_STATUS.HARVEST_DECLARED,
  CERTIFIED: PROJECT_STATUS.HARVEST_CERTIFIED,
  PAID: PROJECT_STATUS.MARKET_PAYMENT_HELD,
  RECEIVED: PROJECT_STATUS.DELIVERED_TO_BUYER,
};

/** The project status each harvest step leaves behind. */
export const nextProjectStatus = (h: Pick<Harvest, "status">): ProjectStatus => PROJECT_STATUS_OF[h.status];
