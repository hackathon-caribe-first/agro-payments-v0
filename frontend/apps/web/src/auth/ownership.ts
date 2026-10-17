import type { KnownRole, Session } from "@agro/shared/modules/auth/domain/role";
import { buyer } from "~/buyer/module";
import { investor as grantsInvestor } from "~/grants/module";
import { buyerHarvest, producerHarvest } from "~/harvest-batches/module";
import { milestones, producer } from "~/producer/module";

// RNF-07 "por proyecto": the role decides the area, the ownership decides WHICH record inside it. Pages addressed by an id
// are checked here once (from the layout guard) so a person never reads or acts on a record of somebody else. A record that
// exists but belongs to another account answers like a missing one (404), so ids do not leak. Lookups that fail or find
// nothing are let through: the page itself reports them.

interface OwnershipRule {
  role: KnownRole;
  pattern: RegExp;
  // true: the record is the session's (or does not exist); false: it belongs to somebody else.
  owns: (id: string, session: Session) => Promise<boolean>;
}

async function producerOwnsProject(projectId: string): Promise<boolean> {
  const dashboard = await producer.getProducerDashboard();
  if (!dashboard.ok) return true;
  const own = [...dashboard.value.drafts, ...dashboard.value.active, ...dashboard.value.finished].some((o) => o.project.id === projectId);
  if (own) return true;
  // Not on this producer's dashboard: foreign when the project exists at all.
  const found = await producer.getProjectWithMilestones(projectId);
  return !found.ok;
}

const RULES: readonly OwnershipRule[] = [
  { role: "PRODUCER", pattern: /^\/producer\/projects\/(?!new(?:\/|$))([^/]+)/, owns: (id) => producerOwnsProject(id) },
  {
    role: "PRODUCER",
    pattern: /^\/producer\/milestones\/([^/]+)/,
    owns: async (id) => {
      const detail = await milestones.getMilestoneDetail(id);
      return detail.ok ? producerOwnsProject(detail.value.projectId) : true;
    },
  },
  {
    role: "PRODUCER",
    pattern: /^\/producer\/orders\/([^/]+)/,
    owns: async (id, session) => {
      const detail = await producerHarvest.getOrderDetail(id);
      return !detail.ok || detail.value.order.producerId === session.profileId;
    },
  },
  {
    role: "BUYER",
    pattern: /^\/buyer\/(?:negotiations|requests)\/([^/]+)/,
    owns: async (id, session) => {
      const detail = await buyer.getRequestDetail(id);
      return !detail.ok || detail.value.request.buyerId === session.profileId;
    },
  },
  {
    role: "BUYER",
    pattern: /^\/buyer\/orders\/([^/]+)/,
    owns: async (id, session) => {
      const detail = await buyerHarvest.getOrderDetail(id);
      return !detail.ok || detail.value.order.buyerId === session.profileId;
    },
  },
  {
    role: "BUYER",
    pattern: /^\/buyer\/open-requests\/(?!new(?:\/|$))([^/]+)/,
    owns: async (id, session) => {
      const board = await buyer.getOpenRequestBoard(id);
      return !board.ok || board.value.openRequest.buyerId === session.profileId;
    },
  },
  {
    role: "INVESTOR",
    pattern: /^\/investor\/grants\/([^/]+)/,
    owns: async (id, session) => {
      const detail = await grantsInvestor.getGrantDetail(id);
      return !detail.ok || detail.value.grant.investorId === session.profileId;
    },
  },
];

export async function ownsRecord(session: Session, pathname: string): Promise<boolean> {
  for (const rule of RULES) {
    if (rule.role !== session.role) continue;
    const match = rule.pattern.exec(pathname);
    if (!match) continue;
    try {
      return await rule.owns(decodeURIComponent(match[1] ?? ""), session);
    } catch {
      return true;
    }
  }
  return true;
}
