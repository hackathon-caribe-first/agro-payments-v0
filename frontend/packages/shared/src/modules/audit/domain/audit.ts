// Audit trail (RNF-06): one read-only, chronological timeline per project. Every entry has a date, an actor with role,
// the change (from -> to) and its cause. The model is the same whatever endpoint the entry came from; unknown values
// degrade to UNKNOWN labels instead of breaking the page. Entries are never edited or removed.

export const AUDIT_TYPES = ["STATUS", "MILESTONE_REVIEW", "NEGOTIATION", "GRANT", "PAYMENT", "HARVEST", "SETTLEMENT", "AUTHORIZATION"] as const;
export type AuditType = (typeof AUDIT_TYPES)[number] | "UNKNOWN";

export const AUDIT_TYPE_LABEL: Record<AuditType, string> = {
  STATUS: "Estado del proyecto",
  MILESTONE_REVIEW: "Revisión de hitos",
  NEGOTIATION: "Negociación y propuestas",
  GRANT: "Grants",
  PAYMENT: "Pagos de líneas",
  HARVEST: "Cosecha",
  SETTLEMENT: "Liquidación",
  AUTHORIZATION: "Autorizaciones de pago",
  UNKNOWN: "Otros eventos",
};

export const ACTOR_ROLES = ["PRODUCER", "INVESTOR", "VERIFIER", "BUYER", "PLATFORM", "WALLET"] as const;
export type AuditActorRole = (typeof ACTOR_ROLES)[number] | "UNKNOWN";

export const ACTOR_ROLE_LABEL: Record<AuditActorRole, string> = {
  PRODUCER: "Productor",
  INVESTOR: "Inversor",
  VERIFIER: "Verificador",
  BUYER: "Comprador",
  PLATFORM: "Plataforma",
  WALLET: "Billetera",
  UNKNOWN: "Sin rol",
};

// Where an entry points to. The page resolves it to a URL for the viewer (producer or investor).
export type AuditLink =
  | { kind: "milestone"; id: string }
  | { kind: "grant"; id: string }
  | { kind: "proposal"; id: string }
  | { kind: "contract"; id: string }
  | { kind: "negotiation"; id: string }
  | { kind: "harvest"; projectId: string }
  | { kind: "settlement"; projectId: string };

export interface AuditEntry {
  id: string;
  type: AuditType;
  at: string;
  actorName: string;
  actorRole: AuditActorRole;
  // What happened, in one line.
  title: string;
  from: string | null;
  to: string | null;
  cause: string | null;
  link: AuditLink | null;
}

export interface AuditTimeline {
  project: { id: string; title: string; statusLabel: string };
  entries: AuditEntry[];
}

export type AuditViewer = "producer" | "investor";

// Pages that exist for each viewer; a link that has no page for that viewer is omitted rather than broken.
export function auditHref(link: AuditLink | null, viewer: AuditViewer): string | null {
  if (!link) return null;
  const producer = viewer === "producer";
  switch (link.kind) {
    case "milestone":
      return producer ? `/producer/milestones/${link.id}` : null;
    case "grant":
      return producer ? null : `/investor/grants/${link.id}`;
    case "proposal":
      return producer ? `/producer/proposals/${link.id}` : `/investor/proposals/${link.id}`;
    case "contract":
      return producer ? `/producer/contracts/${link.id}` : `/investor/contracts/${link.id}`;
    case "negotiation":
      return producer ? `/producer/negotiations/${link.id}` : null;
    case "harvest":
      return producer ? `/producer/projects/${link.projectId}/harvest` : null;
    case "settlement":
      return producer ? `/producer/projects/${link.projectId}/settlement` : `/investor/settlements/${link.projectId}`;
  }
}

export const LINK_LABEL: Record<AuditLink["kind"], string> = {
  milestone: "Ver hito",
  grant: "Ver grant",
  proposal: "Ver propuesta",
  contract: "Ver contrato",
  negotiation: "Ver negociación",
  harvest: "Ver cosecha",
  settlement: "Ver liquidación",
};

export function filterAudit(entries: readonly AuditEntry[], types: readonly AuditType[]): AuditEntry[] {
  return types.length === 0 ? [...entries] : entries.filter((e) => types.includes(e.type));
}

export function countByType(entries: readonly AuditEntry[]): Record<AuditType, number> {
  const counts = Object.fromEntries([...AUDIT_TYPES, "UNKNOWN"].map((t) => [t, 0])) as Record<AuditType, number>;
  for (const e of entries) counts[e.type] += 1;
  return counts;
}

export const parseAuditTypes = (raw: readonly string[]): AuditType[] => AUDIT_TYPES.filter((t) => raw.includes(t));
