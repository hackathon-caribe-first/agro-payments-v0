import type { GrantDetail, GrantEvent } from "../../grants/domain/grant";
import type { HarvestBatch, Settlement } from "../../harvest/domain/harvest";
import type { HistoryEntry as InvestmentHistory, Proposal } from "../../investments/domain/investment";
import { formatMoney } from "../../milestones/milestone-state";
import type { PaymentAuthorization } from "../../payment-authorization/domain/authorization";
import type { HistoryEntry as NegotiationHistory, QuoteRequest } from "../../presales/domain/presale";
import type { Project } from "../../projects/domain/project";
import type { ReviewEntry } from "../../reviews/domain/review";
import { ACTOR_ROLE_LABEL, type AuditActorRole, type AuditEntry, type AuditTimeline, type AuditType } from "./audit";

// Pure mapping from what each module already exposes to the single AuditEntry model. Nothing here talks to the network.

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  CONTRACT_SIGNED: "Contrato firmado",
  FUNDING_IN_PROGRESS: "En espera de aprobación",
  FUNDED_IN_CUSTODY: "Habilitado",
  IN_EXECUTION: "En ejecución",
  HARVEST_DECLARED: "Cosecha declarada",
  HARVEST_CERTIFIED: "Cosecha certificada",
  LISTED_IN_MARKET: "Publicado en el mercado",
  MARKET_PAYMENT_HELD: "Pago autorizado, esperando entrega",
  DELIVERED_TO_BUYER: "Entregado al comprador",
  SETTLEMENT_PROCESSING: "Liquidación en proceso",
  SETTLED_AND_CLOSED: "Liquidado y cerrado",
  CANCELLED_OR_DISPUTED: "Cancelado o en disputa",
};

export const MILESTONE_STATUS_LABEL: Record<string, string> = {
  LOCKED: "Bloqueado",
  ACTIVE: "Activo",
  SUPPLIES_ORDERED: "Insumos pedidos",
  SUPPLIES_PAID: "Insumos pagados",
  IN_FIELD_EXECUTION: "En ejecución en campo",
  SUBMITTED_FOR_REVIEW: "En revisión técnica",
  CHANGES_REQUESTED: "Con observaciones",
  TECHNICALLY_APPROVED: "Aprobado técnicamente",
  LABOR_PAYOUT_PENDING: "Pago del productor pendiente",
  COMPLETED_AND_PAID: "Completado y pagado",
};

const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Propuesta enviada",
  NEGOTIATING: "En negociación",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  WITHDRAWN: "Retirada",
  EXPIRED: "Vencida",
  PENDING_SIGNATURES: "Pendiente de firmas",
  SIGNED: "Firmado",
  REQUESTED: "Solicitada",
  QUOTED: "Con oferta",
  CANCELLED: "Cancelada",
  SENT: "Enviada",
  SUPERSEDED: "Reemplazada",
  AWAITING_PAYMENT_AUTHORIZATION: "Pendiente de autorización",
  AUTHORIZED: "Autorizado",
  PENDING: "Pendiente",
  AGREED: "Acordada",
  OPEN: "Abierta",
};

const GRANT_STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Pendiente de aprobación",
  ACTIVE: "Vigente",
  REVOKED: "Revocado",
  DENIED: "Rechazado",
  EXPIRED: "Vencido",
};

const REVOCATION_REASON_LABEL: Record<string, string> = {
  LAST_LINE_CONFIRMED: "Se confirmó la última línea del hito",
  MILESTONE_CANCELLED: "El hito se canceló",
  DEADLINE_EXPIRED: "Venció el plazo del hito",
  SECURITY_INCIDENT: "Incidente de seguridad",
};

const labelOf = (map: Record<string, string>, raw: string | null | undefined): string | null => (raw ? (map[raw] ?? "Estado desconocido") : null);

const roleOf = (raw: string): AuditActorRole => {
  switch (raw) {
    case "PRODUCER":
    case "INVESTOR":
    case "VERIFIER":
    case "BUYER":
    case "PLATFORM":
    case "WALLET":
      return raw;
    case "SYSTEM":
      return "PLATFORM";
    default:
      return "UNKNOWN";
  }
};

const textOf = (payload: Record<string, unknown> | undefined, keys: readonly string[]): string | null => {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
};

type Draft = Omit<AuditEntry, "id"> & { key: string };

// ---- milestone reviews (RNF-06: verifier comments and verdicts) ----

const REVIEW_TITLE: Record<string, string> = {
  SUBMITTED: "Evidencia enviada a revisión",
  CHANGES_REQUESTED: "Dictamen observado",
  APPROVED_FAVORABLE: "Dictamen aprobado",
  PAYOUT_EXECUTED: "Pago al productor ejecutado",
};

export interface MilestoneHistory {
  milestone: { id: string; sequenceOrder: number; title: string };
  history: readonly ReviewEntry[];
}

function fromReviews(items: readonly MilestoneHistory[]): Draft[] {
  return items.flatMap(({ milestone, history }) =>
    history.map((r) => ({
      key: `review:${r.id}`,
      type: "MILESTONE_REVIEW" as const,
      at: r.createdAt,
      actorName: r.actor.name,
      actorRole: roleOf(r.actor.role),
      title: `Hito ${milestone.sequenceOrder} · ${(r.verdict && REVIEW_TITLE[r.verdict]) || "Cambio de estado del hito"}`,
      from: labelOf(MILESTONE_STATUS_LABEL, r.fromStatus),
      to: labelOf(MILESTONE_STATUS_LABEL, r.toStatus),
      cause: [r.comments, r.subsanaciones.length > 0 ? `Subsanaciones: ${r.subsanaciones.join("; ")}` : null].filter(Boolean).join(" · ") || null,
      link: { kind: "milestone" as const, id: milestone.id },
    })),
  );
}

// ---- investment proposals and contracts ----

const PROPOSAL_EVENT_TITLE: Record<string, string> = {
  PROPOSED: "Propuesta de inversión enviada",
  COUNTER_OFFER: "Contraoferta de inversión",
  ACCEPT: "Propuesta de inversión aceptada",
  REJECT: "Propuesta de inversión rechazada",
  WITHDRAW: "Propuesta de inversión retirada",
  EXPIRE: "Propuesta de inversión vencida",
  AUTO_CLOSE: "Propuesta cerrada automáticamente",
  CONTRACT_GENERATED: "Contrato generado",
  CONTRACT_SIGNED: "Contrato firmado",
};

function fromProposals(proposals: readonly Proposal[]): Draft[] {
  return proposals.flatMap((p) =>
    p.history.map((h: InvestmentHistory) => {
      const contract = h.kind === "CONTRACT_GENERATED" || h.kind === "CONTRACT_SIGNED";
      const role = roleOf(h.actor);
      const known = PROPOSAL_EVENT_TITLE[h.type];
      const amount = typeof h.payload?.amount === "number" ? h.payload.amount : null;
      return {
        key: `proposal:${p.id}:${h.id}`,
        type: (contract ? "STATUS" : "NEGOTIATION") as AuditType,
        at: h.at,
        actorName: role === "INVESTOR" ? p.investorName : role === "PRODUCER" ? p.producerName : ACTOR_ROLE_LABEL[role],
        actorRole: role,
        title: known ?? "Evento de la propuesta de inversión",
        from: labelOf(PROPOSAL_STATUS_LABEL, h.from),
        to: labelOf(PROPOSAL_STATUS_LABEL, h.to),
        cause: textOf(h.payload, ["reason", "comments", "notes"]) ?? (amount !== null ? `Monto propuesto: ${formatMoney(amount, p.currency)}` : null),
        link: contract && p.contractId ? ({ kind: "contract", id: p.contractId } as const) : ({ kind: "proposal", id: p.id } as const),
      };
    }),
  );
}

// ---- negotiations of the project (producer and buyer) ----

const NEGOTIATION_EVENT_TITLE: Record<string, string> = {
  REQUESTED: "Negociación iniciada",
  OFFER: "Oferta enviada",
  COUNTER_OFFER: "Contraoferta",
  ACCEPT: "Oferta aceptada",
  REJECT: "Oferta rechazada",
  WITHDRAW: "Negociación retirada",
  EXPIRE: "Oferta vencida",
  AUTO_CLOSE: "Negociación cerrada automáticamente",
  AUTHORIZE_PAYMENT: "Pago autorizado por el comprador",
  STATUS_CHANGED: "Cambio de estado de la negociación",
};

function fromNegotiations(requests: readonly QuoteRequest[]): Draft[] {
  // The payment authorization has its own entry (from the authorizations endpoint); listing it twice would duplicate it.
  return requests.flatMap((r) =>
    r.history.filter((h) => h.type !== "AUTHORIZE_PAYMENT").map((h: NegotiationHistory) => {
      const role = roleOf(h.actor);
      return {
        key: `negotiation:${r.id}:${h.id}`,
        type: "NEGOTIATION" as AuditType,
        at: h.at,
        actorName: role === "BUYER" || role === "INVESTOR" ? r.buyerName : role === "PRODUCER" ? r.producerName || ACTOR_ROLE_LABEL.PRODUCER : ACTOR_ROLE_LABEL[role],
        actorRole: h.actor === "BUYER" ? ("BUYER" as const) : role,
        title: NEGOTIATION_EVENT_TITLE[h.type] ?? "Evento de la negociación",
        // A step that keeps the same status (an offer inside a negotiation) shows no transition.
        from: h.from === h.to ? null : labelOf(PROPOSAL_STATUS_LABEL, h.from),
        to: h.from === h.to ? null : labelOf(PROPOSAL_STATUS_LABEL, h.to),
        cause: textOf(h.payload, ["reason", "comments", "notes"]),
        link: { kind: "negotiation" as const, id: r.id },
      };
    }),
  );
}

// ---- grants and line payments ----

const GRANT_EVENT_TITLE: Record<string, string> = {
  REQUESTED: "Grant solicitado",
  APPROVAL_RECEIVED: "Aprobación recibida desde la billetera",
  HASH_VERIFIED: "Hash de la interacción verificado: grant vigente",
  HASH_MISMATCH: "El hash de la interacción no coincide",
  TOKEN_STORED: "Token y URL de gestión guardados cifrados",
  DENIED: "Grant rechazado en la billetera",
  TOKEN_ROTATED: "Token del grant rotado",
  PAYMENT_REJECTED: "Pago rechazado por el tope del grant",
  REVOKED: "Grant revocado",
  REVOCATION_VERIFIED: "Revocación verificada: un pago posterior fue rechazado",
};

const GRANT_TRANSITION: Record<string, [string | null, string | null]> = {
  REQUESTED: [null, "PENDING_APPROVAL"],
  HASH_VERIFIED: ["PENDING_APPROVAL", "ACTIVE"],
  DENIED: ["PENDING_APPROVAL", "DENIED"],
  REVOKED: ["ACTIVE", "REVOKED"],
};

function grantCause(e: GrantEvent): string | null {
  switch (e.type) {
    case "REVOKED": {
      const reason = typeof e.detail.reason === "string" ? e.detail.reason : "";
      return REVOCATION_REASON_LABEL[reason] ?? "Motivo no reconocido";
    }
    case "TOKEN_ROTATED":
      return e.detail.reason === "inactive_token" ? "El token había vencido; se rotó y se reintentó el pago." : "Rotación solicitada manualmente.";
    case "PAYMENT_REJECTED":
      return e.detail.concept ? `La línea «${String(e.detail.concept)}» superaba lo que quedaba del tope.` : "Una línea superaba lo que quedaba del tope.";
    case "REQUESTED":
      return "Tope: el presupuesto del hito, sin intervalo.";
    case "HASH_MISMATCH":
      return "No se guardó ningún token.";
    default:
      return null;
  }
}

function fromGrants(details: readonly GrantDetail[], investorName: string): Draft[] {
  return details.flatMap(({ grant, milestone, events, receipts }) => {
    const prefix = `Hito ${milestone.sequenceOrder}`;
    const eventDrafts = events
      // Confirmed payments are listed from their receipts (richer); showing both would duplicate them.
      .filter((e) => e.type !== "PAYMENT_CONFIRMED")
      .map((e): Draft => {
        const transition = GRANT_TRANSITION[e.type];
        const role = e.actor === "INVESTOR" ? "INVESTOR" : e.actor === "WALLET" ? "WALLET" : e.actor === "PLATFORM" ? "PLATFORM" : "UNKNOWN";
        return {
          key: `grant:${grant.id}:${e.id}`,
          type: "GRANT",
          at: e.at,
          actorName: role === "INVESTOR" ? investorName : ACTOR_ROLE_LABEL[role],
          actorRole: role,
          title: `${prefix} · ${GRANT_EVENT_TITLE[e.type] ?? "Evento del grant"}`,
          from: transition ? labelOf(GRANT_STATUS_LABEL, transition[0]) : null,
          to: transition ? labelOf(GRANT_STATUS_LABEL, transition[1]) : null,
          cause: grantCause(e),
          link: { kind: "grant", id: grant.id },
        };
      });
    const paymentDrafts = receipts.map(
      (r): Draft => ({
        key: `payment:${r.id}`,
        type: "PAYMENT",
        at: r.createdAt,
        actorName: ACTOR_ROLE_LABEL.PLATFORM,
        actorRole: "PLATFORM",
        title: `${prefix} · Pago de la línea ${r.lineId}`,
        from: `Gastado: ${formatMoney(r.spentBefore, grant.currency)}`,
        to: `Gastado: ${formatMoney(r.spentAfter, grant.currency)}`,
        cause: `${r.concept} · ${r.beneficiary} recibió ${formatMoney(r.received, grant.currency)} (comisión ${formatMoney(r.fee, grant.currency)}).`,
        link: { kind: "grant", id: grant.id },
      }),
    );
    return [...eventDrafts, ...paymentDrafts];
  });
}

// ---- payment authorizations (buyer grant for the project) ----

function fromAuthorizations(items: readonly PaymentAuthorization[], buyerName: (id: string) => string): Draft[] {
  return items.flatMap((a) => {
    const created: Draft = {
      key: `authorization:${a.id}`,
      type: "AUTHORIZATION",
      at: a.createdAt,
      actorName: buyerName(a.buyerId),
      actorRole: "BUYER",
      title: "Autorización de pago creada",
      from: "Pendiente",
      to: "Autorizado",
      cause: `Tope autorizado: ${formatMoney(a.cap, a.currency)}.`,
      link: { kind: "negotiation", id: a.negotiationId },
    };
    if (!a.revokedAt) return [created];
    return [
      created,
      {
        key: `authorization:${a.id}:revoked`,
        type: "AUTHORIZATION" as const,
        at: a.revokedAt,
        actorName: buyerName(a.buyerId),
        actorRole: "BUYER" as const,
        title: "Autorización de pago revocada",
        from: "Autorizado",
        to: "Revocado",
        cause: `Se había usado ${formatMoney(a.spent, a.currency)} del tope.`,
        link: { kind: "negotiation" as const, id: a.negotiationId },
      },
    ];
  });
}

// ---- harvest and settlement ----

function fromHarvest(batches: readonly HarvestBatch[], projectId: string): Draft[] {
  return batches.flatMap((b) => {
    const declared: Draft = {
      key: `harvest:${b.id}:declared`,
      type: "HARVEST",
      at: b.declaredAt,
      actorName: b.producerName,
      actorRole: "PRODUCER",
      title: "Cosecha declarada",
      from: null,
      to: PROJECT_STATUS_LABEL.HARVEST_DECLARED,
      cause: b.notes || null,
      link: { kind: "harvest", projectId },
    };
    if (!b.certification) return [declared];
    return [
      declared,
      {
        key: `harvest:${b.id}:certified`,
        type: "HARVEST" as const,
        at: b.certification.certifiedAt,
        actorName: b.certification.verifierName,
        actorRole: "VERIFIER" as const,
        title: "Cosecha certificada",
        from: PROJECT_STATUS_LABEL.HARVEST_DECLARED,
        to: PROJECT_STATUS_LABEL.HARVEST_CERTIFIED,
        cause: b.certification.comments || null,
        link: { kind: "harvest" as const, projectId },
      },
    ];
  });
}

const LINE_KIND_LABEL: Record<string, string> = {
  PLATFORM_FEE: "comisión de la plataforma",
  INVESTOR_CAPITAL: "capital del inversor",
  INVESTOR_YIELD: "rendimiento del inversor",
  PRODUCER_NET: "neto del productor",
};

function fromSettlements(settlements: readonly Settlement[]): Draft[] {
  return settlements.flatMap((s) => {
    const started: Draft = {
      key: `settlement:${s.id}`,
      type: "SETTLEMENT",
      at: s.createdAt,
      actorName: ACTOR_ROLE_LABEL.PLATFORM,
      actorRole: "PLATFORM",
      title: "Liquidación ejecutada",
      from: PROJECT_STATUS_LABEL.SETTLEMENT_PROCESSING,
      to: PROJECT_STATUS_LABEL.SETTLED_AND_CLOSED,
      cause: `Venta de ${formatMoney(s.total, s.currency)} repartida en ${s.lines.length} líneas${s.loss ? "; la venta no cubrió el capital y el rendimiento" : ""}.`,
      link: { kind: "settlement", projectId: s.projectId },
    };
    const lines = s.lines
      .filter((l) => l.state === "completado" && l.executedAt)
      .map(
        (l): Draft => ({
          key: `settlement:${s.id}:${l.id}`,
          type: "SETTLEMENT",
          at: l.executedAt ?? s.createdAt,
          actorName: ACTOR_ROLE_LABEL.PLATFORM,
          actorRole: "PLATFORM",
          title: `Pago de liquidación · ${LINE_KIND_LABEL[l.kind] ?? "otra línea"}`,
          from: null,
          to: "Completado",
          cause: `${l.beneficiaryName} recibió ${formatMoney(l.amount, s.currency)}.`,
          link: { kind: "settlement", projectId: s.projectId },
        }),
      );
    const revoked: Draft[] = s.revocation
      ? [
          {
            key: `settlement:${s.id}:revoked`,
            type: "SETTLEMENT",
            at: s.revocation.revokedAt,
            actorName: ACTOR_ROLE_LABEL.PLATFORM,
            actorRole: "PLATFORM",
            title: "Grant de la orden revocado",
            from: "Vigente",
            to: "Revocado",
            cause: `Respuesta ${s.revocation.responseStatus}; quedaron ${formatMoney(s.revocation.remaining, s.currency)} sin gastar en la billetera del comprador.`,
            link: { kind: "settlement", projectId: s.projectId },
          },
        ]
      : [];
    return [started, ...lines, ...revoked];
  });
}

// ---- timeline ----

export interface AuditSources {
  project: Project;
  milestoneHistories: readonly MilestoneHistory[];
  proposals: readonly Proposal[];
  negotiations: readonly QuoteRequest[];
  grants: readonly GrantDetail[];
  authorizations: readonly PaymentAuthorization[];
  batches: readonly HarvestBatch[];
  settlements: readonly Settlement[];
  investorName: string;
}

export function buildAudit(src: AuditSources): AuditTimeline {
  const buyerNames = new Map<string, string>();
  for (const n of src.negotiations) buyerNames.set(n.buyerId, n.buyerName);

  const drafts: Draft[] = [
    ...fromReviews(src.milestoneHistories),
    ...fromProposals(src.proposals),
    ...fromNegotiations(src.negotiations),
    ...fromGrants(src.grants, src.investorName),
    ...fromAuthorizations(src.authorizations, (id) => buyerNames.get(id) ?? ACTOR_ROLE_LABEL.BUYER),
    ...fromHarvest(src.batches, src.project.id),
    ...fromSettlements(src.settlements),
  ];

  // First approved grant of the project: the project moves from "waiting" to "quotation approved".
  const firstApproval = src.grants
    .flatMap((g) => g.events.filter((e) => e.type === "HASH_VERIFIED").map((e) => ({ e, grantId: g.grant.id })))
    .sort((a, b) => a.e.at.localeCompare(b.e.at))[0];
  if (firstApproval && ["FUNDED_IN_CUSTODY", "IN_EXECUTION", "HARVEST_DECLARED", "HARVEST_CERTIFIED"].includes(src.project.currentStatus)) {
    drafts.push({
      key: `status:first-grant:${firstApproval.grantId}`,
      type: "STATUS",
      at: firstApproval.e.at,
      actorName: ACTOR_ROLE_LABEL.PLATFORM,
      actorRole: "PLATFORM",
      title: "El proyecto avanzó al aprobarse el primer grant",
      from: PROJECT_STATUS_LABEL.FUNDING_IN_PROGRESS,
      to: PROJECT_STATUS_LABEL.FUNDED_IN_CUSTODY,
      cause: "Se verificó la aprobación del grant del primer hito.",
      link: { kind: "grant", id: firstApproval.grantId },
    });
  }

  const entries: AuditEntry[] = drafts
    .sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key))
    .map(({ key, ...entry }) => ({ id: key, ...entry }));

  return {
    project: { id: src.project.id, title: src.project.title, statusLabel: PROJECT_STATUS_LABEL[src.project.currentStatus] ?? "Estado desconocido" },
    entries,
  };
}
