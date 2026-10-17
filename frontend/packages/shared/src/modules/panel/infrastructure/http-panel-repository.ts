import type { GrantDetail, GrantView } from "../../grants/domain/grant";
import { toGrantDetail, toInvestorGrants } from "../../grants/infrastructure/mapper";
import type { Settlement } from "../../harvest/domain/harvest";
import { toSettlements } from "../../harvest/infrastructure/mapper";
import { toContract, toProposals } from "../../investments/infrastructure/mapper";
import type { ProjectLines } from "../../payment-lines/application/payment-lines-repository";
import { toProjectLines } from "../../payment-lines/infrastructure/mapper";
import type { PanelIdentity, PanelRepository } from "../application/panel-repository";
import {
  newestFirst,
  progressPct,
  remainingInWallet,
  sumRemaining,
  type FeedItem,
  type InvestorPanel,
  type LineCounts,
  type PanelGrant,
  type PanelMilestone,
  type PanelProject,
} from "../domain/panel";
import { JsonReader } from "./json-reader";

interface Options {
  baseUrl?: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

const countLines = (lines: ProjectLines["milestones"][number]["lines"]): LineCounts => ({
  total: lines.length,
  paid: lines.filter((l) => l.status === "completado").length,
  pending: lines.filter((l) => l.status === "pendiente" || l.status === "en_cola").length,
  failed: lines.filter((l) => l.status === "fallido").length,
});

// Aggregates the existing endpoints (grants, milestone lines, investments, settlements) into one panel read.
// Every optional source (lines, settlements, contracts) degrades to empty instead of failing the page.
export class HttpPanelRepository implements PanelRepository {
  private readonly reader: JsonReader;

  constructor({ baseUrl, fetchFn }: Options) {
    this.reader = new JsonReader({ baseUrl, fetchFn });
  }

  async loadInvestorPanel({ grantInvestorId, proposalInvestorId }: PanelIdentity): Promise<InvestorPanel> {
    const [grantsRaw, proposalsRaw] = await Promise.all([
      this.reader.get(`/investors/${enc(grantInvestorId)}/grants`),
      this.reader.getOptional(`/investments/proposals?investor_id=${enc(proposalInvestorId)}`),
    ]);
    const grantViews: GrantView[] = grantsRaw ? toInvestorGrants(grantsRaw).grants : [];
    const proposals = proposalsRaw ? toProposals(proposalsRaw).filter((p) => p.status === "ACCEPTED") : [];

    const contractByProject = new Map<string, string>();
    for (const p of proposals) if (p.contractId) contractByProject.set(p.projectId, p.contractId);
    const titleByProject = new Map<string, { title: string; currency: string }>();
    for (const p of proposals) titleByProject.set(p.projectId, { title: p.projectTitle, currency: p.currency });
    for (const v of grantViews) titleByProject.set(v.project.id, { title: v.project.title, currency: v.project.currency });

    const projectIds = [...new Set([...grantViews.map((v) => v.project.id), ...proposals.map((p) => p.projectId)])];

    const [details, perProject] = await Promise.all([
      Promise.all(grantViews.map((v) => this.reader.getOptional(`/grants/${enc(v.grant.id)}`))),
      Promise.all(
        projectIds.map(async (projectId) => {
          const contractId = contractByProject.get(projectId);
          const [linesRaw, settlementsRaw, contractRaw] = await Promise.all([
            this.reader.getOptional(`/projects/${enc(projectId)}/milestone-lines`),
            this.reader.getOptional(`/settlements/projects/${enc(projectId)}`),
            contractId ? this.reader.getOptional(`/contracts/${enc(contractId)}`) : Promise.resolve(null),
          ]);
          return {
            projectId,
            lines: linesRaw ? toProjectLines(linesRaw) : null,
            settlements: settlementsRaw ? toSettlements(settlementsRaw) : ([] as Settlement[]),
            contract: contractRaw ? toContract(contractRaw) : null,
          };
        }),
      ),
    ]);

    const detailByGrant = new Map<string, GrantDetail>();
    details.forEach((raw, i) => {
      if (raw) detailByGrant.set(grantViews[i].grant.id, toGrantDetail(raw));
    });

    const feed: FeedItem[] = [];
    const projects: PanelProject[] = perProject.map(({ projectId, lines, settlements, contract }) => {
      const meta = titleByProject.get(projectId) ?? { title: lines?.project.title ?? projectId, currency: "COP" };
      const views = grantViews.filter((v) => v.project.id === projectId);

      const grantFor = (milestoneId: string): PanelGrant | null => {
        const live = views.filter((v) => v.grant.milestoneId === milestoneId).sort((a, b) => b.grant.createdAt.localeCompare(a.grant.createdAt))[0];
        if (!live) return null;
        const g = live.grant;
        return {
          id: g.id,
          status: g.status,
          cap: g.capAmount,
          spent: g.spent,
          remainingInWallet: remainingInWallet(g.status, g.capAmount, g.spent, g.revocation?.remainingInWallet ?? null),
          tokenMasked: g.tokenMasked,
        };
      };

      // Milestones with payment lines first, plus any granted milestone the lines endpoint does not know.
      const milestones: PanelMilestone[] = [];
      const seen = new Set<string>();
      for (const m of lines?.milestones ?? []) {
        seen.add(m.milestone.id);
        const grant = grantFor(m.milestone.id);
        milestones.push({
          id: m.milestone.id,
          sequenceOrder: m.milestone.sequenceOrder,
          title: m.milestone.title,
          cap: m.milestone.cap,
          grant,
          lines: countLines(m.lines),
          progressPct: progressPct(grant?.spent ?? 0, m.milestone.cap),
        });
      }
      for (const v of views) {
        if (seen.has(v.milestone.id)) continue;
        seen.add(v.milestone.id);
        const grant = grantFor(v.milestone.id);
        milestones.push({
          id: v.milestone.id,
          sequenceOrder: v.milestone.sequenceOrder,
          title: v.milestone.title,
          cap: v.milestone.budget,
          grant,
          lines: { total: 0, paid: 0, pending: 0, failed: 0 },
          progressPct: progressPct(grant?.spent ?? 0, v.milestone.budget),
        });
      }
      milestones.sort((a, b) => a.sequenceOrder - b.sequenceOrder);

      for (const v of views) {
        for (const r of detailByGrant.get(v.grant.id)?.receipts ?? []) {
          feed.push({
            id: r.id,
            grantId: v.grant.id,
            projectId,
            projectTitle: meta.title,
            milestoneId: v.milestone.id,
            milestoneTitle: v.milestone.title,
            currency: v.grant.currency,
            concept: r.concept,
            beneficiary: r.beneficiary,
            received: r.received,
            fee: r.fee,
            debited: r.debited,
            incomingPaymentId: r.incomingPaymentId,
            outgoingPaymentId: r.outgoingPaymentId,
            createdAt: r.createdAt,
          });
        }
      }

      // Totals count only milestones that hold (or held) a spending permission.
      const granted = milestones.filter((m) => m.grant && m.grant.status !== "DENIED");
      const cap = granted.reduce((t, m) => t + (m.grant?.cap ?? 0), 0);
      const spent = granted.reduce((t, m) => t + (m.grant?.spent ?? 0), 0);
      return {
        id: projectId,
        title: meta.title,
        currency: meta.currency,
        contractId: contract?.id ?? contractByProject.get(projectId) ?? null,
        milestones,
        cap,
        spent,
        remainingInWallet: sumRemaining(milestones),
        progressPct: progressPct(spent, cap),
        settlements: settlements.map((s) => ({
          id: s.id,
          status: s.status,
          total: s.total,
          lines: s.lines.length,
          paidLines: s.lines.filter((l) => l.state === "completado").length,
        })),
      };
    });

    feed.sort(newestFirst);
    const cap = projects.reduce((t, p) => t + p.cap, 0);
    const spent = projects.reduce((t, p) => t + p.spent, 0);
    return {
      projects,
      feed,
      totals: {
        currency: projects[0]?.currency ?? "COP",
        cap,
        spent,
        remainingInWallet: projects.reduce((t, p) => t + p.remainingInWallet, 0),
        progressPct: progressPct(spent, cap),
        paymentsConfirmed: feed.length,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
