import { err, ok } from "../../milestones/domain/errors";
import { toFieldErrors } from "../../milestones/schemas/evidence-log";
import type { MilestoneGrant } from "../../grants/domain/grant";
import type { MilestoneSummary } from "../../milestones/domain/milestone";
import { projectQuotationTotal } from "../../projects/domain/project-rules";
import { attemptPresale } from "../domain/errors";
import type { AuthorizationState, CatalogProject, QuoteRequest } from "../domain/presale";
import {
  agreedMilestonePrices,
  canAuthorizePayment,
  canStart,
  findLiveNegotiation,
  isAgreed,
  type StartBlock,
} from "../domain/negotiation-rules";
import { authorizePaymentSchema } from "../schemas/revision";
import { buildStartMilestoneNegotiationSchema } from "../schemas/start-milestone-negotiation";
import { buildStartProjectNegotiationSchema } from "../schemas/start-project-negotiation";
import type { PartyIdentity } from "./presale-repository";
import type { PaymentAuthorization } from "../../payment-authorization/domain/authorization";
import type { Project } from "../../projects/domain/project";
import { toEntries, withEffectiveStatus, type PresaleDeps, type RequestEntry } from "./use-cases";

// Flow A: the buyer browses projects, negotiates the whole project or one milestone, and an agreed project is covered by a
// payment authorization (the money stays in the buyer wallet). One use case per loader/action.

const sortBySequence = (a: MilestoneSummary, b: MilestoneSummary) => a.sequenceOrder - b.sequenceOrder;

// The buyer's own project negotiations, with lazy expiry applied.
async function buyerProjectNegotiations(deps: PresaleDeps, buyerId: string): Promise<QuoteRequest[]> {
  const today = deps.today();
  const all = await deps.presales.listBuyerRequests(buyerId);
  return all.filter((n) => n.origin === "PROJECT_INTEREST" && n.scope !== null).map((n) => withEffectiveStatus(n, today));
}

function startBlockFor(
  deps: PresaleDeps,
  catalog: CatalogProject,
  milestone: MilestoneSummary | null,
  negotiations: QuoteRequest[],
  buyerId: string,
): { block: StartBlock | null; live: QuoteRequest | null } {
  const scope = milestone ? "MILESTONE" : "PROJECT";
  const targetId = milestone ? milestone.id : catalog.project.id;
  const live = findLiveNegotiation(negotiations, buyerId, scope, targetId, deps.today());
  const block = canStart({
    project: catalog.project,
    milestone: milestone ? { id: milestone.id, status: milestone.status } : null,
    negotiationLocked: catalog.negotiationLocked,
    agreedMilestoneIds: catalog.agreedMilestoneIds,
    ownerId: catalog.producerId,
    starterId: buyerId,
    hasLive: live !== null,
  });
  return { block, live };
}

// ---- catalog ----

export interface CatalogEntry {
  catalog: CatalogProject;
  milestonesCount: number;
  // Total de la cotización del proyecto, with this buyer's agreed milestone prices applied.
  total: number;
  startBlock: StartBlock | null;
  // The buyer's live negotiation on the whole project, if any.
  myLiveProjectId: string | null;
}

export const listBuyerCatalog = (deps: PresaleDeps, buyerId: string) =>
  attemptPresale<CatalogEntry[]>(async () => {
    const [catalog, negotiations] = await Promise.all([deps.presales.listCatalog(), buyerProjectNegotiations(deps, buyerId)]);
    const prices = agreedMilestonePrices(negotiations, buyerId);
    const entries: CatalogEntry[] = [];
    for (const item of catalog) {
      const milestones = await deps.milestones.listByProject(item.project.id);
      const { block, live } = startBlockFor(deps, item, null, negotiations, buyerId);
      entries.push({
        catalog: item,
        milestonesCount: milestones.length,
        total: projectQuotationTotal(milestones, prices),
        startBlock: block,
        myLiveProjectId: live?.id ?? null,
      });
    }
    return ok(entries);
  });

// ---- project detail ----

export interface MilestoneRow {
  summary: MilestoneSummary;
  estimatedCompletionDate: string | null;
  // Supplies + labor budget: the reference the opening offer is prefilled with.
  reference: number;
  // The price this buyer agreed on, if any.
  agreedPrice: number | null;
  startBlock: StartBlock | null;
  myLiveId: string | null;
}

export interface ProjectAgreement {
  negotiationId: string;
  authorization: AuthorizationState | null;
}

export interface BuyerProjectDetail {
  catalog: CatalogProject;
  milestones: MilestoneRow[];
  total: number;
  projectStartBlock: StartBlock | null;
  myLiveProjectId: string | null;
  // The buyer's own agreed PROJECT negotiation, with its payment authorization state.
  agreement: ProjectAgreement | null;
}

export const getBuyerProjectDetail = (deps: PresaleDeps, projectId: string, buyerId: string) =>
  attemptPresale<BuyerProjectDetail>(async () => {
    const catalog = await deps.presales.getCatalogProject(projectId);
    if (!catalog) return err({ kind: "not_found" });
    const [summaries, negotiations] = await Promise.all([deps.milestones.listByProject(projectId), buyerProjectNegotiations(deps, buyerId)]);
    const mine = negotiations.filter((n) => n.projectId === projectId);
    const prices = agreedMilestonePrices(mine, buyerId);

    const rows: MilestoneRow[] = [];
    for (const summary of [...summaries].sort(sortBySequence)) {
      const detail = await deps.milestones.getDetail(summary.id);
      const { block, live } = startBlockFor(deps, catalog, summary, mine, buyerId);
      rows.push({
        summary,
        estimatedCompletionDate: detail?.estimatedCompletionDate ?? null,
        reference: summary.suppliesBudget + summary.laborBudget,
        agreedPrice: prices.get(summary.id) ?? null,
        startBlock: block,
        myLiveId: live?.id ?? null,
      });
    }

    const project = startBlockFor(deps, catalog, null, mine, buyerId);
    const agreed = mine.find((n) => n.scope === "PROJECT" && isAgreed(n)) ?? null;
    return ok({
      catalog,
      milestones: rows,
      total: agreed?.authorization ? agreed.authorization.agreedTotal : projectQuotationTotal(summaries, prices),
      projectStartBlock: project.block,
      myLiveProjectId: project.live?.id ?? null,
      agreement: agreed ? { negotiationId: agreed.id, authorization: agreed.authorization } : null,
    });
  });

// ---- the start form ----

export interface StartNegotiationForm {
  catalog: CatalogProject;
  milestone: MilestoneSummary | null;
  // Values the form is prefilled with: a milestone's budget and date; for a project only the date.
  reference: { price: number | null; deliveryDate: string };
  total: number;
  block: StartBlock | null;
  // Link target when the buyer already has a live negotiation on this target.
  myLiveId: string | null;
}

export const getStartNegotiationForm = (deps: PresaleDeps, projectId: string, milestoneId: string | null, buyerId: string) =>
  attemptPresale<StartNegotiationForm>(async () => {
    const catalog = await deps.presales.getCatalogProject(projectId);
    if (!catalog) return err({ kind: "not_found" });
    const [summaries, negotiations] = await Promise.all([deps.milestones.listByProject(projectId), buyerProjectNegotiations(deps, buyerId)]);
    const milestone = milestoneId ? (summaries.find((m) => m.id === milestoneId) ?? null) : null;
    if (milestoneId && !milestone) return err({ kind: "not_found" });

    const { block, live } = startBlockFor(deps, catalog, milestone, negotiations, buyerId);
    const detail = milestone ? await deps.milestones.getDetail(milestone.id) : null;
    return ok({
      catalog,
      milestone,
      reference: {
        price: milestone ? milestone.suppliesBudget + milestone.laborBudget : null,
        deliveryDate: detail?.estimatedCompletionDate ?? catalog.project.estimatedEndDate,
      },
      total: projectQuotationTotal(summaries, agreedMilestonePrices(negotiations, buyerId)),
      block,
      myLiveId: live?.id ?? null,
    });
  });

// ---- start ----

export const startNegotiation = (
  deps: PresaleDeps,
  target: { projectId: string; milestoneId: string | null },
  buyer: PartyIdentity,
  raw: unknown,
) =>
  attemptPresale<QuoteRequest>(async () => {
    const today = deps.today();
    const catalog = await deps.presales.getCatalogProject(target.projectId);
    if (!catalog) return err({ kind: "not_found" });
    const summaries = await deps.milestones.listByProject(target.projectId);
    const milestone = target.milestoneId ? (summaries.find((m) => m.id === target.milestoneId) ?? null) : null;
    if (target.milestoneId && !milestone) return err({ kind: "not_found" });

    const { block } = startBlockFor(deps, catalog, milestone, await buyerProjectNegotiations(deps, buyer.id), buyer.id);
    if (block) return err({ kind: "not_negotiable", reason: block });

    if (milestone) {
      const parsed = buildStartMilestoneNegotiationSchema(today).safeParse(raw);
      if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
      return ok(await deps.presales.startNegotiation(target.projectId, buyer, { scope: "MILESTONE", milestoneId: milestone.id, input: parsed.data }));
    }
    const parsed = buildStartProjectNegotiationSchema(today).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.presales.startNegotiation(target.projectId, buyer, { scope: "PROJECT", input: parsed.data }));
  });

// ---- the producer's project page ----

export interface ProducerProjectView {
  project: Project;
  milestones: MilestoneSummary[];
  // Negotiations on this project (both scopes), newest first.
  negotiations: RequestEntry[];
  // The agreed PROJECT negotiation, with its payment authorization state, if any.
  agreement: QuoteRequest | null;
  // Payment authorizations granted on this project, newest first.
  authorizations: PaymentAuthorization[];
  // Investor grants on this project's milestones (read-only), in milestone order.
  grants: MilestoneGrant[];
  // Milestones with an agreed MILESTONE negotiation: price, delivery date and buyer, in milestone order.
  agreedMilestones: AgreedMilestone[];
}

export interface AgreedMilestone {
  milestoneId: string;
  sequenceOrder: number;
  title: string;
  price: number;
  deliveryDate: string;
  buyerName: string;
  negotiationId: string;
}

// One read for the whole producer project page: project, milestones, negotiations and payment authorizations.
export const getProducerProjectView = (deps: PresaleDeps, projectId: string) =>
  attemptPresale<ProducerProjectView>(async () => {
    const project = await deps.projects.getProject(projectId);
    if (!project) return err({ kind: "not_found" });
    const [milestones, requests, authorizationList, grantsView] = await Promise.all([
      deps.milestones.listByProject(projectId),
      deps.presales.listProducerRequests(projectId, deps.ownProducerId ?? undefined),
      deps.paymentAuthorizations.listProjectAuthorizations(projectId),
      // Secondary read-only card: an unavailable grants endpoint must not take the whole page down.
      deps.grants.getProjectGrants(projectId).catch(() => null),
    ]);
    const order = new Map(milestones.map((m) => [m.id, m.sequenceOrder]));
    const grants = [...(grantsView?.grants ?? [])].sort((a, b) => (order.get(a.milestoneId) ?? 0) - (order.get(b.milestoneId) ?? 0));
    const negotiations = await toEntries(deps, requests);
    const authorizations = [...(authorizationList ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const agreedMilestones: AgreedMilestone[] = [];
    for (const { request } of negotiations) {
      if (request.scope !== "MILESTONE" || !request.milestoneId || !isAgreed(request)) continue;
      const summary = milestones.find((m) => m.id === request.milestoneId);
      const terms = request.quotes.find((q) => q.status === "ACCEPTED")?.terms;
      if (!summary || terms?.kind !== "MILESTONE") continue;
      agreedMilestones.push({
        milestoneId: summary.id,
        sequenceOrder: summary.sequenceOrder,
        title: summary.title,
        price: terms.price,
        deliveryDate: terms.deliveryDate,
        buyerName: request.buyerName,
        negotiationId: request.id,
      });
    }
    agreedMilestones.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    return ok({
      project,
      milestones: [...milestones].sort(sortBySequence),
      agreedMilestones,
      negotiations,
      agreement: negotiations.find((e) => e.request.scope === "PROJECT" && isAgreed(e.request))?.request ?? null,
      authorizations,
      grants,
    });
  });

// ---- payment authorization ----

// The buyer executes the pending payment authorization of an agreed PROJECT negotiation with the total they saw.
export const authorizeProjectPayment = (deps: PresaleDeps, negotiationId: string, buyer: PartyIdentity, raw: unknown) =>
  attemptPresale<QuoteRequest>(async () => {
    const request = await deps.presales.getRequest(negotiationId);
    if (!request || request.buyerId !== buyer.id) return err({ kind: "not_found" });
    const catalog = await deps.presales.getCatalogProject(request.projectId);
    if (!catalog) return err({ kind: "not_found" });

    const block = canAuthorizePayment(request, "BUYER", buyer.id, catalog.project);
    if (block) return err({ kind: "authorization_unavailable", reason: block });

    const parsed = authorizePaymentSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: { expectedTotal: ["Confirma el total a autorizar."] } });
    return ok(await deps.presales.authorizePayment(negotiationId, buyer, parsed.data.expectedTotal));
  });

