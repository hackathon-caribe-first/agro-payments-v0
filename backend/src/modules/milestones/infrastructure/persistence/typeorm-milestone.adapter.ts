import { type DataSource, type EntityManager, In } from "typeorm";
import type {
  Decision,
  EvidenceLog,
  Line,
  LineKind,
  LineReceipt,
  LineStatus,
  LogType,
  Milestone,
  MilestoneStatus,
  ReviewEntry,
  ReviewVerdict,
} from "../../application/milestone";
import { MilestoneRepository } from "../../ports/milestone.repository";
import { MilestoneEntity, MilestoneEvidenceLogEntity, MilestoneLineEntity, MilestoneReviewEntity } from "./milestone.entity";

type MilestoneRow = Omit<MilestoneEntity, "seq">;

const toRow = (m: Milestone): MilestoneRow => ({
  id: m.id,
  title: m.title,
  amount: m.amount,
  currency: m.currency,
  assetScale: m.assetScale,
  status: m.status,
  evidenceDescription: m.evidence?.description ?? null,
  evidenceSubmittedAt: m.evidence?.submittedAt ?? null,
  reviewDecision: m.review?.decision ?? null,
  reviewReason: m.review?.reason ?? null,
  reviewedAt: m.review?.reviewedAt ?? null,
  fundedAt: m.fundedAt,
  closedAt: m.closedAt,
  projectId: m.projectId,
  sequenceOrder: m.sequenceOrder,
  description: m.description,
  estimatedCompletionDate: m.estimatedCompletionDate,
  requiredEvidences: m.requirements,
});

const toLogRow = (milestoneId: string, l: EvidenceLog, position: number): MilestoneEvidenceLogEntity => ({ milestoneId, position, ...l, attestation: l.attestation ?? null });
const toReviewRow = (milestoneId: string, r: ReviewEntry, position: number): MilestoneReviewEntity => ({ milestoneId, position, ...r });

const toLog = ({ milestoneId: _, position: __, attestation, ...r }: MilestoneEvidenceLogEntity): EvidenceLog => ({
  ...r,
  logType: r.logType as LogType,
  ...(attestation && { attestation }),
});
const toReview = ({ milestoneId: _, position: __, ...r }: MilestoneReviewEntity): ReviewEntry => ({ ...r, verdict: r.verdict as ReviewVerdict });

const toLineRow = (milestoneId: string, l: Line, position: number): MilestoneLineEntity => ({
  milestoneId,
  id: l.id,
  position,
  kind: l.kind,
  beneficiary: l.beneficiary,
  walletAddress: l.walletAddress,
  amount: l.amount,
  status: l.status,
  reference: l.reference,
  settledAt: l.settledAt,
  receiptIncomingPaymentId: l.receipt?.incomingPaymentId ?? null,
  receiptOutgoingPaymentId: l.receipt?.outgoingPaymentId ?? null,
  receiptQuoteId: l.receipt?.quoteId ?? null,
  receiptDebitValue: l.receipt?.debitAmount?.value ?? null,
  receiptDebitAssetCode: l.receipt?.debitAmount?.assetCode ?? null,
  receiptDebitAssetScale: l.receipt?.debitAmount?.assetScale ?? null,
  receiptReceiveValue: l.receipt?.receiveAmount?.value ?? null,
  receiptReceiveAssetCode: l.receipt?.receiveAmount?.assetCode ?? null,
  receiptReceiveAssetScale: l.receipt?.receiveAmount?.assetScale ?? null,
  receiptRate: l.receipt?.rate ?? null,
  receiptFee: l.receipt?.fee ?? null,
  receiptGrantSpentBefore: l.receipt?.grantSpentBefore ?? null,
  receiptGrantSpentAfter: l.receipt?.grantSpentAfter ?? null,
});

const amountOf = (value: number | null, assetCode: string | null, assetScale: number | null) =>
  value !== null && assetCode !== null && assetScale !== null ? { value, assetCode, assetScale } : null;

function toReceipt(r: MilestoneLineEntity): LineReceipt | null {
  const receipt: LineReceipt = {
    incomingPaymentId: r.receiptIncomingPaymentId,
    outgoingPaymentId: r.receiptOutgoingPaymentId,
    quoteId: r.receiptQuoteId,
    debitAmount: amountOf(r.receiptDebitValue, r.receiptDebitAssetCode, r.receiptDebitAssetScale),
    receiveAmount: amountOf(r.receiptReceiveValue, r.receiptReceiveAssetCode, r.receiptReceiveAssetScale),
    rate: r.receiptRate,
    fee: r.receiptFee,
    grantSpentBefore: r.receiptGrantSpentBefore,
    grantSpentAfter: r.receiptGrantSpentAfter,
  };
  return Object.values(receipt).every((v) => v === null) ? null : receipt;
}

// Rows hold what the domain wrote, so the string columns are trusted back into their unions.
const toLine = (r: MilestoneLineEntity): Line => ({
  id: r.id,
  kind: r.kind as LineKind,
  beneficiary: r.beneficiary,
  walletAddress: r.walletAddress,
  amount: r.amount,
  status: r.status as LineStatus,
  reference: r.reference,
  settledAt: r.settledAt,
  receipt: toReceipt(r),
});

type Children = { lines: MilestoneLineEntity[]; logs: MilestoneEvidenceLogEntity[]; reviews: MilestoneReviewEntity[] };

const toMilestone = (r: MilestoneEntity, { lines, logs, reviews }: Children): Milestone => ({
  id: r.id,
  title: r.title,
  amount: r.amount,
  currency: r.currency,
  assetScale: r.assetScale,
  status: r.status as MilestoneStatus,
  evidence: r.evidenceDescription !== null && r.evidenceSubmittedAt ? { description: r.evidenceDescription, submittedAt: r.evidenceSubmittedAt } : null,
  review: r.reviewDecision && r.reviewedAt ? { decision: r.reviewDecision as Decision, reason: r.reviewReason, reviewedAt: r.reviewedAt } : null,
  lines: lines.map(toLine),
  fundedAt: r.fundedAt,
  closedAt: r.closedAt,
  projectId: r.projectId,
  sequenceOrder: r.sequenceOrder,
  description: r.description,
  estimatedCompletionDate: r.estimatedCompletionDate,
  requirements: r.requiredEvidences,
  evidenceLogs: logs.map(toLog),
  reviews: reviews.map(toReview),
});

// RNF-04: a milestone and its lines are written in one transaction, so a reader never sees half a payment.
// ponytail: last write wins; the load→pay→save window (a network call) has no row lock or version check. Add a version column if two operators pay at once.
export class TypeOrmMilestoneAdapter extends MilestoneRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async findAll() {
    return this.withChildren(await this.dataSource.getRepository(MilestoneEntity).find({ order: { seq: "ASC" } }));
  }

  async findById(id: string) {
    const row = await this.dataSource.getRepository(MilestoneEntity).findOneBy({ id });
    return row ? (await this.withChildren([row]))[0] : null;
  }

  async findByProject(projectId: string) {
    return this.withChildren(await this.dataSource.getRepository(MilestoneEntity).find({ where: { projectId }, order: { sequenceOrder: "ASC" } }));
  }

  private async withChildren(rows: MilestoneEntity[]) {
    if (rows.length === 0) return [];
    const where = { milestoneId: In(rows.map((r) => r.id)) };
    const order = { position: "ASC" } as const;
    const [lines, logs, reviews] = await Promise.all([
      this.dataSource.getRepository(MilestoneLineEntity).find({ where, order }),
      this.dataSource.getRepository(MilestoneEvidenceLogEntity).find({ where, order }),
      this.dataSource.getRepository(MilestoneReviewEntity).find({ where, order }),
    ]);
    const of = <T extends { milestoneId: string }>(children: T[], id: string) => children.filter((c) => c.milestoneId === id);
    return rows.map((r) => toMilestone(r, { lines: of(lines, r.id), logs: of(logs, r.id), reviews: of(reviews, r.id) }));
  }

  save(milestone: Milestone) {
    return this.dataSource.transaction((manager) => writeMilestone(manager, milestone));
  }

  /** Demo data goes in only when the table is empty, so a restart never resets real payment state. */
  seedIfEmpty(milestones: Milestone[]) {
    return this.dataSource.transaction(async (manager) => {
      if ((await manager.count(MilestoneEntity)) > 0) return;
      for (const m of milestones) await writeMilestone(manager, m);
    });
  }
}

// Exported for TypeOrmProjectAdapter, which writes a new project and its milestones in one transaction.
// Logs and reviews are append-only in the domain, so upserting by (milestone_id, id) never loses history.
export async function writeMilestone(manager: EntityManager, m: Milestone) {
  await manager.upsert(MilestoneEntity, toRow(m), ["id"]);
  await manager.upsert(
    MilestoneLineEntity,
    m.lines.map((l, i) => toLineRow(m.id, l, i)),
    ["milestoneId", "id"],
  );
  if (m.evidenceLogs.length > 0) await manager.upsert(MilestoneEvidenceLogEntity, m.evidenceLogs.map((l, i) => toLogRow(m.id, l, i)), ["milestoneId", "id"]);
  if (m.reviews.length > 0) await manager.upsert(MilestoneReviewEntity, m.reviews.map((r, i) => toReviewRow(m.id, r, i)), ["milestoneId", "id"]);
}
