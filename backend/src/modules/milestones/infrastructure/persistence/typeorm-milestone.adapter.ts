import type { DataSource, EntityManager } from "typeorm";
import type { Decision, Line, LineKind, LineReceipt, LineStatus, Milestone, MilestoneStatus } from "../../application/milestone";
import { MilestoneRepository } from "../../ports/milestone.repository";
import { MilestoneEntity, MilestoneLineEntity } from "./milestone.entity";

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
});

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

const toMilestone = (r: MilestoneEntity, lines: MilestoneLineEntity[]): Milestone => ({
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
});

// RNF-04: a milestone and its lines are written in one transaction, so a reader never sees half a payment.
// ponytail: last write wins; the load→pay→save window (a network call) has no row lock or version check. Add a version column if two operators pay at once.
export class TypeOrmMilestoneAdapter extends MilestoneRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async findAll() {
    const rows = await this.dataSource.getRepository(MilestoneEntity).find({ order: { seq: "ASC" } });
    const lines = await this.dataSource.getRepository(MilestoneLineEntity).find({ order: { position: "ASC" } });
    return rows.map((r) => toMilestone(r, lines.filter((l) => l.milestoneId === r.id)));
  }

  async findById(id: string) {
    const row = await this.dataSource.getRepository(MilestoneEntity).findOneBy({ id });
    if (!row) return null;
    const lines = await this.dataSource.getRepository(MilestoneLineEntity).find({ where: { milestoneId: id }, order: { position: "ASC" } });
    return toMilestone(row, lines);
  }

  save(milestone: Milestone) {
    return this.dataSource.transaction((manager) => write(manager, milestone));
  }

  /** Demo data goes in only when the table is empty, so a restart never resets real payment state. */
  seedIfEmpty(milestones: Milestone[]) {
    return this.dataSource.transaction(async (manager) => {
      if ((await manager.count(MilestoneEntity)) > 0) return;
      for (const m of milestones) await write(manager, m);
    });
  }
}

async function write(manager: EntityManager, m: Milestone) {
  await manager.upsert(MilestoneEntity, toRow(m), ["id"]);
  await manager.upsert(
    MilestoneLineEntity,
    m.lines.map((l, i) => toLineRow(m.id, l, i)),
    ["milestoneId", "id"],
  );
}
