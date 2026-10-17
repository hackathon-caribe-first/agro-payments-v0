// RF-09: the contract between investors, patrimonio autónomo (fiduciaria), producer and buyer, rendered from one template
// (Fase 0 paso 8) and signed by every party. Pure functions: no Nest, no I/O.
//
// The body carries no version and no timestamp, so the same terms always hash the same: regenerating unchanged terms is a
// no-op, and a signature binds to the exact text it was given (contractHash).

import { createHash } from "node:crypto";
import { RejectedError } from "../../../shared/domain-errors";
import type { Milestone } from "../../milestones/application/milestone";
import type { Project, Viewer } from "../../projects/application/project";
import { SURPLUS_SPLIT_PCT } from "../../settlement/application/liquidation";
import type { InsurancePolicy } from "./insurance";
import { describePrice, formatMoney, type PurchaseContract } from "./purchase-contract";

export const PARTY_ROLE = { INVESTOR: "investor", FIDUCIARIA: "fiduciaria", PRODUCER: "producer", BUYER: "buyer" } as const;
export type PartyRole = (typeof PARTY_ROLE)[keyof typeof PARTY_ROLE];

/** userId null: any user with the fiduciaria role signs for the patrimonio autónomo. */
export interface ContractParty {
  role: PartyRole;
  userId: string | null;
  name: string;
}

export interface ContractSignature {
  partyRole: PartyRole;
  userId: string;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
  /** The hash of the text signed. */
  contractHash: string;
}

export interface ContractDocument {
  id: string;
  projectId: string;
  version: number;
  body: string;
  /** sha256 of body, hex. */
  hash: string;
  parties: ContractParty[];
  signatures: ContractSignature[];
  createdBy: string;
  createdAt: Date;
}

export interface ContractContext {
  project: Pick<Project, "id" | "projectCode" | "title" | "startDate" | "estimatedEndDate" | "currency" | "ownerUserId">;
  milestones: Pick<Milestone, "sequenceOrder" | "title" | "amount" | "estimatedCompletionDate">[];
  purchase: PurchaseContract;
  policy: InsurancePolicy | null;
  producerName: string;
  buyerName: string;
  /** Captured investors, one per user; capital in COP minor units as it reached custody. */
  investors: { userId: string; name: string; capital: number }[];
}

export const TEMPLATE_VERSION = "surco-contrato@1";

const cop = (minor: number) => formatMoney(minor, "COP");
const [surplusInvestors, surplusProducer, surplusPlatform] = [SURPLUS_SPLIT_PCT.investors, SURPLUS_SPLIT_PCT.producer, SURPLUS_SPLIT_PCT.platform];

// ponytail: one fixed template in code (no legal review, no per-crop clauses); a template store comes with legal generation.
export function renderContract(c: ContractContext): string {
  const { project, purchase, policy } = c;
  const milestones = [...c.milestones].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
  const lines = [
    `# Contrato de financiación por hitos · ${project.projectCode}`,
    `Plantilla: ${TEMPLATE_VERSION}`,
    "",
    `Proyecto: ${project.title} (${project.projectCode}), del ${project.startDate} al ${project.estimatedEndDate}.`,
    "",
    "## Partes",
    ...c.investors.map((i) => `- Inversionista: ${i.name} · capital ${cop(i.capital)}`),
    "- Patrimonio autónomo: la fiduciaria, titular de la wallet de custodia del proyecto",
    `- Productor: ${c.producerName}`,
    `- Comprador: ${c.buyerName}`,
    "",
    "## Hitos y topes",
    "Cada hito se paga desde la custodia con un grant cuyo tope es su presupuesto; el grant del hito siguiente solo existe con el dictamen aprobado del anterior.",
    ...milestones.map((m) => `- Hito ${m.sequenceOrder ?? "-"} · ${m.title} · tope ${cop(m.amount)}${m.estimatedCompletionDate ? ` · fecha estimada ${m.estimatedCompletionDate}` : ""}`),
    "",
    "## Contrato de compra",
    `- ${describePrice(purchase)}`,
    `- Cantidad: ${purchase.quantity.toLocaleString("es-CO")} ${purchase.unit}`,
    `- Moneda: ${purchase.currency}`,
    "- El comprador paga la cosecha a la wallet de custodia del patrimonio autónomo.",
    "",
    "## Seguro",
    ...(policy
      ? [
          `- Aseguradora: ${policy.insurerName}`,
          `- Prima: ${cop(policy.terms.grossPremium)}; subsidio ISA ${policy.terms.subsidyPct} %; Prima neta: ${cop(policy.terms.netPremium)}, pagada desde la custodia al activar el proyecto`,
          `- Umbral: ${policy.terms.thresholdPct} % del rendimiento esperado; deducible ${policy.terms.deductiblePct} %`,
          "- Beneficiario: patrimonio autónomo; la indemnización entra a la custodia",
        ]
      : ["- Sin póliza registrada."]),
    "",
    "## Liquidación",
    `La caja disponible se paga en este orden de prelación: deuda del integrador, capital a prorrata, retorno preferente, aporte del productor y excedente (${surplusInvestors} % inversionistas, ${surplusProducer} % productor, ${surplusPlatform} % Plataforma). Si no alcanza, se paga hasta donde llega y los inversionistas asumen la pérdida.`,
    "",
    "## Firmas",
    "Este contrato queda perfeccionado cuando firman todas las partes; cada firma registra el usuario, el rol, la fecha y el hash de este texto.",
  ];
  return lines.join("\n");
}

export const contractHash = (body: string) => createHash("sha256").update(body).digest("hex");

function partiesOf(c: ContractContext): ContractParty[] {
  return [
    ...c.investors.map((i) => ({ role: PARTY_ROLE.INVESTOR, userId: i.userId, name: i.name })),
    { role: PARTY_ROLE.FIDUCIARIA, userId: null, name: "Patrimonio autónomo (fiduciaria)" },
    { role: PARTY_ROLE.PRODUCER, userId: c.project.ownerUserId, name: c.producerName },
    { role: PARTY_ROLE.BUYER, userId: c.purchase.buyerUserId, name: c.buyerName },
  ];
}

export function buildContractDocument({ id, version, context, createdBy, now }: { id: string; version: number; context: ContractContext; createdBy: string; now: Date }): ContractDocument {
  const body = renderContract(context);
  return { id, projectId: context.project.id, version, body, hash: contractHash(body), parties: partiesOf(context), signatures: [], createdBy, createdAt: now };
}

const signed = (doc: ContractDocument, party: ContractParty) =>
  doc.signatures.some((s) => s.partyRole === party.role && (party.userId === null || s.userId === party.userId));

const isParty = (party: ContractParty, viewer: Viewer) => (party.userId === null ? viewer.role === "fidu" : party.userId === viewer.id);

/** The parties this viewer may still sign as (a buyer who also invested signs both). */
export const signableParties = (doc: ContractDocument, viewer: Viewer) => doc.parties.filter((p) => isParty(p, viewer) && !signed(doc, p));

export function signContract(doc: ContractDocument, viewer: Viewer, meta: { ip: string | null; userAgent: string | null }, now: Date): ContractDocument {
  if (!doc.parties.some((p) => isParty(p, viewer))) throw new RejectedError("No eres parte de este contrato.");
  const parties = signableParties(doc, viewer);
  if (parties.length === 0) throw new RejectedError("Ya firmaste este contrato.");
  const added = parties.map((p) => ({ partyRole: p.role, userId: viewer.id, signedAt: now, ip: meta.ip, userAgent: meta.userAgent, contractHash: doc.hash }));
  return { ...doc, signatures: [...doc.signatures, ...added] };
}

export const fullySigned = (doc: ContractDocument) => doc.parties.every((p) => signed(doc, p));
