import { Column, Entity, PrimaryColumn } from "typeorm";
import type { EvidencePayload, Requirement } from "../../application/milestone";
import { minorUnits } from "./minor-units.transformer";

// Rows, not domain objects: TypeOrmMilestoneAdapter maps them. Schema lives in the migrations (no synchronize).
@Entity({ name: "milestones" })
export class MilestoneEntity {
  @PrimaryColumn("text")
  id: string;
  /** Insertion order, so lists keep the seed order. */
  @Column({ type: "bigint", insert: false, update: false })
  seq: string;
  @Column("text")
  title: string;
  @Column({ type: "bigint", transformer: minorUnits })
  amount: number;
  @Column("text")
  currency: string;
  @Column({ type: "integer", name: "asset_scale" })
  assetScale: number;
  @Column("text")
  status: string;
  @Column({ type: "text", name: "evidence_description", nullable: true })
  evidenceDescription: string | null;
  @Column({ type: "timestamptz", name: "evidence_submitted_at", nullable: true })
  evidenceSubmittedAt: Date | null;
  @Column({ type: "text", name: "review_decision", nullable: true })
  reviewDecision: string | null;
  @Column({ type: "text", name: "review_reason", nullable: true })
  reviewReason: string | null;
  @Column({ type: "timestamptz", name: "reviewed_at", nullable: true })
  reviewedAt: Date | null;
  @Column({ type: "timestamptz", name: "funded_at", nullable: true })
  fundedAt: Date | null;
  @Column({ type: "timestamptz", name: "closed_at", nullable: true })
  closedAt: Date | null;
  @Column({ type: "text", name: "project_id", nullable: true })
  projectId: string | null;
  @Column({ type: "integer", name: "sequence_order", nullable: true })
  sequenceOrder: number | null;
  @Column("text")
  description: string;
  /** pg `date`, read back as "yyyy-mm-dd". */
  @Column({ type: "date", name: "estimated_completion_date", nullable: true })
  estimatedCompletionDate: string | null;
  /** The domain Requirement[] as is (camelCase keys). */
  @Column({ type: "jsonb", name: "required_evidences" })
  requiredEvidences: Requirement[];
}

@Entity({ name: "milestone_evidence_logs" })
export class MilestoneEvidenceLogEntity {
  @PrimaryColumn({ type: "text", name: "milestone_id" })
  milestoneId: string;
  @PrimaryColumn("text")
  id: string;
  @Column("integer")
  position: number;
  @Column({ type: "text", name: "log_type" })
  logType: string;
  @Column("text")
  notes: string;
  @Column({ type: "jsonb", name: "evidence_payload" })
  evidencePayload: EvidencePayload;
  @Column({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
}

@Entity({ name: "milestone_reviews" })
export class MilestoneReviewEntity {
  @PrimaryColumn({ type: "text", name: "milestone_id" })
  milestoneId: string;
  @PrimaryColumn("text")
  id: string;
  @Column("integer")
  position: number;
  @Column("text")
  verdict: string;
  @Column({ type: "text", nullable: true })
  comment: string | null;
  @Column({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
}

@Entity({ name: "milestone_lines" })
export class MilestoneLineEntity {
  @PrimaryColumn({ type: "text", name: "milestone_id" })
  milestoneId: string;
  @PrimaryColumn("text")
  id: string;
  @Column("integer")
  position: number;
  @Column("text")
  kind: string;
  @Column("text")
  beneficiary: string;
  @Column({ type: "text", name: "wallet_address" })
  walletAddress: string;
  @Column({ type: "bigint", transformer: minorUnits })
  amount: number;
  @Column("text")
  status: string;
  @Column({ type: "text", nullable: true })
  reference: string | null;
  @Column({ type: "timestamptz", name: "settled_at", nullable: true })
  settledAt: Date | null;
  // RF-23 receipt, flattened; all null means no receipt yet.
  @Column({ type: "text", name: "receipt_incoming_payment_id", nullable: true })
  receiptIncomingPaymentId: string | null;
  @Column({ type: "text", name: "receipt_outgoing_payment_id", nullable: true })
  receiptOutgoingPaymentId: string | null;
  @Column({ type: "text", name: "receipt_quote_id", nullable: true })
  receiptQuoteId: string | null;
  @Column({ type: "bigint", name: "receipt_debit_value", nullable: true, transformer: minorUnits })
  receiptDebitValue: number | null;
  @Column({ type: "text", name: "receipt_debit_asset_code", nullable: true })
  receiptDebitAssetCode: string | null;
  @Column({ type: "integer", name: "receipt_debit_asset_scale", nullable: true })
  receiptDebitAssetScale: number | null;
  @Column({ type: "bigint", name: "receipt_receive_value", nullable: true, transformer: minorUnits })
  receiptReceiveValue: number | null;
  @Column({ type: "text", name: "receipt_receive_asset_code", nullable: true })
  receiptReceiveAssetCode: string | null;
  @Column({ type: "integer", name: "receipt_receive_asset_scale", nullable: true })
  receiptReceiveAssetScale: number | null;
  @Column({ type: "text", name: "receipt_rate", nullable: true })
  receiptRate: string | null;
  @Column({ type: "bigint", name: "receipt_fee", nullable: true, transformer: minorUnits })
  receiptFee: number | null;
  @Column({ type: "bigint", name: "receipt_grant_spent_before", nullable: true, transformer: minorUnits })
  receiptGrantSpentBefore: number | null;
  @Column({ type: "bigint", name: "receipt_grant_spent_after", nullable: true, transformer: minorUnits })
  receiptGrantSpentAfter: number | null;
}
