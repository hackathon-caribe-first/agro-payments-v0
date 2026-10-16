import { ApiProperty } from "@nestjs/swagger";

const RECIPIENTS = ["productor", "proveedor", "trabajadores"];

export class ShareDto {
  @ApiProperty({ enum: RECIPIENTS, enumName: "Recipient" })
  recipient: "productor" | "proveedor" | "trabajadores";
  percent: number;
  /** Whole currency units */
  amount: number;
}

export class EvidenceDto {
  description: string;
  submittedAt: Date;
}

export class ReviewDto {
  @ApiProperty({ enum: ["approved", "rejected"], enumName: "Decision" })
  decision: "approved" | "rejected";
  @ApiProperty({ type: String, nullable: true })
  reason: string | null;
  reviewedAt: Date;
}

export class PaymentDto {
  @ApiProperty({ enum: ["processing", "confirmed"], enumName: "PaymentStatus" })
  status: "processing" | "confirmed";
  /** Simulated transfer reference, never a real bank reference */
  reference: string;
  @ApiProperty({ type: [ShareDto] })
  shares: ShareDto[];
  orderedAt: Date;
  @ApiProperty({ type: Date, nullable: true })
  confirmedAt: Date | null;
}

export class MilestoneDto {
  id: string;
  title: string;
  /** Whole currency units */
  amount: number;
  /** ISO 4217 code */
  currency: string;
  @ApiProperty({ enum: ["draft", "evidence_submitted", "approved", "rejected"], enumName: "MilestoneStatus" })
  status: "draft" | "evidence_submitted" | "approved" | "rejected";
  @ApiProperty({ type: EvidenceDto, nullable: true })
  evidence: EvidenceDto | null;
  @ApiProperty({ type: ReviewDto, nullable: true })
  review: ReviewDto | null;
  @ApiProperty({ type: PaymentDto, nullable: true })
  payment: PaymentDto | null;
}
