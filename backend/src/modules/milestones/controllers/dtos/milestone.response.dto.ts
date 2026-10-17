import { ApiProperty } from "@nestjs/swagger";
import { LINE_KIND, LINE_STATUS, MILESTONE_STATUS } from "../../application/milestone";
import type { LineKind, LineStatus, MilestoneStatus } from "../../application/milestone";

export class LineDto {
  id: string;
  @ApiProperty({ enum: Object.values(LINE_KIND), enumName: "LineKind" })
  kind: LineKind;
  beneficiary: string;
  walletAddress: string;
  /** Integer minor units (see assetScale) */
  amount: number;
  @ApiProperty({ enum: Object.values(LINE_STATUS), enumName: "LineStatus" })
  status: LineStatus;
  /** Gateway payment reference; simulated ones start with SIM-, Open Payments ones hold the incoming and outgoing payment URLs */
  @ApiProperty({ type: String, nullable: true })
  reference: string | null;
  @ApiProperty({ type: Date, nullable: true })
  settledAt: Date | null;
}

export class EvidenceDto {
  description: string;
  submittedAt: Date;
}

export class ReviewDto {
  @ApiProperty({ enum: ["approved", "observado"], enumName: "Decision" })
  decision: "approved" | "observado";
  @ApiProperty({ type: String, nullable: true })
  reason: string | null;
  reviewedAt: Date;
}

export class MilestoneDto {
  id: string;
  title: string;
  /** Integer minor units: amount / 10^assetScale is the human value */
  amount: number;
  /** ISO 4217 code */
  currency: string;
  /** Decimal places of the minor unit (COP demo data uses 2) */
  assetScale: number;
  @ApiProperty({ enum: Object.values(MILESTONE_STATUS), enumName: "MilestoneStatus" })
  status: MilestoneStatus;
  @ApiProperty({ type: EvidenceDto, nullable: true })
  evidence: EvidenceDto | null;
  @ApiProperty({ type: ReviewDto, nullable: true })
  review: ReviewDto | null;
  @ApiProperty({ type: [LineDto] })
  lines: LineDto[];
  /** Set when the investor approved the grant that funds the lines; no line is paid before */
  @ApiProperty({ type: Date, nullable: true })
  fundedAt: Date | null;
  /** Set once every line is completado or fallido */
  @ApiProperty({ type: Date, nullable: true })
  closedAt: Date | null;
}
