import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

export class ReviewMilestoneDto {
  @ApiProperty({ enum: ["approved", "rejected"], enumName: "Decision" })
  @IsIn(["approved", "rejected"])
  decision: "approved" | "rejected";

  /** Required when rejecting: what the producer must correct */
  @IsOptional()
  @IsString()
  reason?: string;
}
